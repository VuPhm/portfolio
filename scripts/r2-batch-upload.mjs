#!/usr/bin/env node
/**
 * Cloudflare R2 Media Upload & Verification Tool — Round 03.4
 *
 * Implements deterministic batch upload of 15 optimized portfolio videos to Cloudflare R2,
 * idempotency checks (skip identical, resume/retry), metadata attachment (Content-Type, Cache-Control),
 * and object verification.
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeFileHash8 } from './media-encode.mjs';
import { loadR2Config } from './r2-adapter.mjs';

const ROOT = process.cwd();
const READY_DIR = '/Users/vup/Downloads/portfolio-ready';
const VIDEOS_DIR = join(READY_DIR, 'videos');
const POSTERS_DIR = join(READY_DIR, 'posters');
const READY_MANIFEST = join(READY_DIR, 'manifest.json');
const LOCAL_PLAN_OUT = join(ROOT, 'media-workspace', 'r2-upload-plan.json');
const LOCAL_REPORT_OUT = join(ROOT, 'media-workspace', 'r2-upload-report.json');

function execWrangler(args) {
  try {
    const res = spawnSync('npx', ['--yes', 'wrangler', ...args], {
      encoding: 'utf8',
      env: process.env,
    });
    return {
      success: res.status === 0,
      code: res.status,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
    };
  } catch (err) {
    return {
      success: false,
      code: -1,
      stdout: '',
      stderr: String(err),
    };
  }
}

export function checkR2Status() {
  const res = execWrangler(['r2', 'bucket', 'list']);
  if (!res.success) {
    if (res.stderr.includes('10042') || res.stdout.includes('10042') || res.stderr.includes('Please enable R2')) {
      return {
        enabled: false,
        error: 'R2_NOT_ENABLED_DASHBOARD',
        message: 'R2 has not been enabled on this Cloudflare account yet. Please enable R2 in Cloudflare Dashboard.',
        details: res.stderr || res.stdout,
      };
    }
    return {
      enabled: false,
      error: 'WRANGLER_R2_ERROR',
      message: res.stderr || res.stdout,
    };
  }
  return {
    enabled: true,
    bucketsRaw: res.stdout,
  };
}

export function buildUploadPlan() {
  const config = loadR2Config('https://media.vuphm.io.vn');
  const manifest = JSON.parse(readFileSync(READY_MANIFEST, 'utf8'));

  const items = [];
  let totalBytes = 0;

  for (const v of manifest.videos) {
    const slug = v.slug;
    const videoFile = join(VIDEOS_DIR, `${slug}.mp4`);
    if (!existsSync(videoFile)) {
      throw new Error(`Video file missing: ${videoFile}`);
    }
    const stat = statSync(videoFile);
    totalBytes += stat.size;
    const hash8 = computeFileHash8(videoFile);
    const fullSha256 = createHash('sha256').update(readFileSync(videoFile)).digest('hex');

    const objectKey = `standalone/${slug}/web-standard.${hash8}.mp4`;
    const publicUrl = `${config.customDomain}/${objectKey}`;

    items.push({
      slug,
      title: v.title,
      orientation: v.orientation || '9:16',
      duration: v.duration,
      localPath: videoFile,
      sizeBytes: stat.size,
      hash8,
      sha256: fullSha256,
      objectKey,
      publicUrl,
      posterPublicUrl: `/media/posters/${slug}.webp`,
      mimeType: 'video/mp4',
      cacheControl: config.headers?.versioned?.['Cache-Control'] || 'public, max-age=31536000, immutable',
    });
  }

  return {
    config,
    totalVideos: items.length,
    totalBytes,
    totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    totalGb: Number((totalBytes / 1e9).toFixed(4)),
    items,
  };
}

export function ensureBucket(bucketName = 'vuphm-portfolio-media') {
  console.log(`Checking bucket '${bucketName}'...`);
  const listRes = execWrangler(['r2', 'bucket', 'list']);
  if (!listRes.success) {
    throw new Error(`Failed to list buckets: ${listRes.stderr || listRes.stdout}`);
  }
  const buckets = listRes.stdout;
  if (!buckets.includes(bucketName)) {
    console.log(`Creating bucket '${bucketName}' (Standard storage class)...`);
    const createRes = execWrangler(['r2', 'bucket', 'create', bucketName]);
    if (!createRes.success) {
      throw new Error(`Failed to create bucket: ${createRes.stderr || createRes.stdout}`);
    }
    console.log(`Bucket '${bucketName}' created successfully.`);
  } else {
    console.log(`Bucket '${bucketName}' already exists.`);
  }

  // Ensure dev-url is disabled (bucket remains private initially)
  console.log(`Ensuring bucket '${bucketName}' private status (r2.dev URL disabled)...`);
  execWrangler(['r2', 'bucket', 'dev-url', 'disable', bucketName]);

  // Set CORS configuration
  const corsPath = join(ROOT, 'config', 'r2-cors.json');
  if (existsSync(corsPath)) {
    console.log(`Configuring CORS for bucket '${bucketName}'...`);
    execWrangler(['r2', 'bucket', 'cors', 'set', bucketName, corsPath]);
  }
}

export function uploadBatch(options = {}) {
  const plan = buildUploadPlan();
  const bucketName = plan.config.bucketName;
  ensureBucket(bucketName);

  console.log(`\nStarting upload of ${plan.totalVideos} videos to '${bucketName}'...`);
  const results = [];

  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    const targetPath = `${bucketName}/${item.objectKey}`;
    console.log(`[${i + 1}/${plan.totalVideos}] Processing ${item.slug} (${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB)...`);

    // Check if object already exists
    const checkTemp = join(ROOT, 'media-workspace', `.temp-check-${item.slug}`);
    let alreadyExists = false;
    const getRes = execWrangler(['r2', 'object', 'get', targetPath, '--file', checkTemp]);
    if (getRes.success && existsSync(checkTemp)) {
      const existingSize = statSync(checkTemp).size;
      if (existingSize === item.sizeBytes) {
        console.log(`  -> Already exists with identical size (${existingSize} B). SKIPPING.`);
        alreadyExists = true;
        try { unlinkSync(checkTemp); } catch (_) {}
        results.push({ ...item, uploadStatus: 'SKIPPED_IDENTICAL' });
        continue;
      } else {
        console.warn(`  -> Conflict! Object exists with size ${existingSize} vs local ${item.sizeBytes}. Will overwrite with verified file.`);
      }
      try { unlinkSync(checkTemp); } catch (_) {}
    }

    // Upload with Content-Type and Cache-Control
    console.log(`  -> Uploading to ${targetPath}...`);
    const putRes = execWrangler([
      'r2', 'object', 'put', targetPath,
      '--file', item.localPath,
      '--content-type', item.mimeType,
      '--cache-control', item.cacheControl,
    ]);

    if (!putRes.success) {
      console.error(`  -> Upload failed: ${putRes.stderr || putRes.stdout}`);
      results.push({ ...item, uploadStatus: 'FAILED', error: putRes.stderr || putRes.stdout });
    } else {
      console.log(`  -> Uploaded successfully.`);
      results.push({ ...item, uploadStatus: 'UPLOADED' });
    }
  }

  const successCount = results.filter((r) => r.uploadStatus === 'UPLOADED' || r.uploadStatus === 'SKIPPED_IDENTICAL').length;
  console.log(`\nUpload complete: ${successCount}/${plan.totalVideos} successful.`);
  return { plan, results, successCount };
}

export function runPreflight() {
  console.log('=== Round 03.4 Cloudflare R2 Preflight Check ===');
  const r2Check = checkR2Status();
  console.log('R2 Subscription status:', r2Check.enabled ? 'ACTIVE' : `INACTIVE (${r2Check.error})`);
  const plan = buildUploadPlan();
  console.log(`Ready videos: ${plan.totalVideos} files`);
  console.log(`Total payload: ${plan.totalMb} MB (${plan.totalGb} GB)`);
  console.log(`Target bucket: ${plan.config.bucketName}`);
  console.log(`Target custom domain: ${plan.config.customDomain}`);

  mkdirSync(join(ROOT, 'media-workspace'), { recursive: true });
  writeFileSync(LOCAL_PLAN_OUT, JSON.stringify(plan, null, 2));
  return { r2Check, plan };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'preflight';
  if (cmd === 'preflight') {
    runPreflight();
  } else if (cmd === 'upload') {
    uploadBatch();
  }
}
