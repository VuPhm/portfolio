#!/usr/bin/env node
/**
 * Cloudflare R2 Delivery Adapter, Budget Estimator & HTTP Range Verifier — Round 03.1
 *
 * Prepares R2 delivery configuration, object keys, versioned URLs, MIME/cache headers,
 * measures pre-upload storage & operations against Cloudflare Free Tier / configured budget,
 * and verifies HTTP Range (`206 Partial Content`, Safari `bytes=0-1` probe, mid-stream seek, faststart).
 *
 * Safety guarantees:
 *  - NEVER provisions cloud buckets, changes DNS, enables paid services, or uploads to production automatically.
 *  - NEVER stores credentials in the repository.
 *
 * Usage:
 *  pnpm media:r2 [--manifest media-workspace/media-manifest.json] [--domain https://media.example.com]
 *  pnpm media:verify-range [--manifest media-workspace/media-manifest.json | --file <video.mp4>]
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFileHash8 } from './media-encode.mjs';
import { formatBytes, inspectIsoBmffBoxes, inspectMediaFile } from './media-inspect.mjs';

const ROOT = process.cwd();
const LOCAL_CONFIG_PATH = join(ROOT, 'config', 'r2.config.local.json');
const TEMPLATE_CONFIG_PATH = join(ROOT, 'config', 'r2.config.template.json');
const DEFAULT_MEDIA_MANIFEST = join(ROOT, 'media-workspace', 'media-manifest.json');
const DEFAULT_PLAN_OUT = join(ROOT, 'media-workspace', 'r2-delivery-plan.json');

export function loadR2Config(customDomainOverride = null) {
  const configPath = existsSync(LOCAL_CONFIG_PATH) ? LOCAL_CONFIG_PATH : TEMPLATE_CONFIG_PATH;
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const domain = (
    customDomainOverride ||
    process.env.PUBLIC_MEDIA_BASE_URL ||
    cfg.customDomain ||
    'https://media.example.com'
  ).replace(/\/+$/, '');
  const bucketName = process.env.R2_BUCKET_NAME || cfg.bucketName || 'portfolio-media';
  return { ...cfg, customDomain: domain, bucketName, configSource: relative(ROOT, configPath) };
}

/**
 * Builds deterministic R2 object key and versioned public URL for a video rendition.
 */
export function buildR2ObjectTarget({
  config,
  collectionSlug = null,
  videoSlug,
  presetId,
  ext = '.mp4',
  hash8 = 'v1',
}) {
  if (presetId === 'poster' && config.keyStrategy?.posterDelivery === 'cloudflare-pages') {
    const publicPath = (config.keyStrategy.posterPublicPath || '/media/posters/{slug}.webp').replace(
      '{slug}',
      videoSlug
    );
    return {
      deliveryProvider: 'pages',
      objectKey: null,
      publicUrl: publicPath,
      mimeType: config.headers?.mimeTypes?.[ext] ?? 'image/webp',
      cacheControl: config.headers?.versioned?.['Cache-Control'] ?? 'public, max-age=31536000, immutable',
    };
  }

  const versionToken = hash8 || config.keyStrategy?.defaultVersionTag || 'v1';
  const pattern = collectionSlug
    ? config.keyStrategy?.collectionPattern || 'collections/{collection}/{slug}/{preset}.{version}{ext}'
    : config.keyStrategy?.standalonePattern || 'standalone/{slug}/{preset}.{version}{ext}';

  const objectKey = pattern
    .replace('{collection}', collectionSlug || 'standalone')
    .replace('{slug}', videoSlug)
    .replace('{preset}', presetId)
    .replace('{version}', versionToken)
    .replace('{ext}', ext);

  const mimeType = config.headers?.mimeTypes?.[ext] ?? 'video/mp4';
  const cacheControl = config.headers?.versioned?.['Cache-Control'] ?? 'public, max-age=31536000, immutable';
  const publicUrl = `${config.customDomain}/${objectKey}`;

  return {
    deliveryProvider: 'r2',
    objectKey,
    publicUrl,
    mimeType,
    cacheControl,
    acceptRanges: 'bytes',
  };
}

/**
 * Estimates Cloudflare R2 storage, Class A/B operations, and cost against Free Tier & budget limits.
 */
export function estimateR2Budget({ config, r2Objects, visitorsOverride = null }) {
  const totalBytes = r2Objects.reduce((acc, obj) => acc + (obj.sizeBytes || 0), 0);
  const totalGb = totalBytes / 1e9; // Cloudflare R2 bills in decimal GB (10^9 bytes)

  const traffic = {
    ...(config.trafficAssumptions ?? {}),
    ...(visitorsOverride !== null ? { monthlyUniqueVisitors: Number(visitorsOverride) } : {}),
  };

  const visitors = traffic.monthlyUniqueVisitors ?? 5000;
  const hoverPerVisit = traffic.avgHoverPreviewsPerVisit ?? 6;
  const playsPerVisit = traffic.avgFullVideoPlaysPerVisit ?? 2;
  const rangesPerPlay = traffic.avgRangeRequestsPerPlay ?? 8;
  const monthlySyncUploads = traffic.monthlySyncUploads ?? 200;

  // Class A: initial object uploads + monthly re-syncs/manifest writes
  const estimatedClassAOps = r2Objects.length * 2 + monthlySyncUploads;
  // Class B: hover previews (~2 range/GET requests each) + full plays (initial probe + range chunks)
  const estimatedClassBOps = Math.round(visitors * (hoverPerVisit * 2 + playsPerVisit * rangesPerPlay));

  const free = config.freeTierLimits ?? {
    storageGbMonth: 10.0,
    classAOperationsMonth: 1000000,
    classBOperationsMonth: 10000000,
  };
  const rates = config.ratesAboveFreeTierUsd ?? {
    storagePerGbMonth: 0.015,
    classAPerMillion: 4.5,
    classBPerMillion: 0.36,
  };
  const budget = config.budget ?? {
    maxMonthlyCostUsd: 0.0,
    warnStorageGb: 7.0,
    maxStorageGb: 9.0,
    warnClassAOpsMonth: 500000,
    maxClassAOpsMonth: 900000,
    warnClassBOpsMonth: 5000000,
    maxClassBOpsMonth: 9000000,
  };

  const billableStorageGb = Math.max(0, totalGb - free.storageGbMonth);
  const billableClassA = Math.max(0, estimatedClassAOps - free.classAOperationsMonth);
  const billableClassB = Math.max(0, estimatedClassBOps - free.classBOperationsMonth);

  const estimatedMonthlyCostUsd = Number(
    (
      billableStorageGb * rates.storagePerGbMonth +
      (billableClassA / 1e6) * rates.classAPerMillion +
      (billableClassB / 1e6) * rates.classBPerMillion
    ).toFixed(4)
  );

  const alerts = [];
  let status = 'OK';

  if (totalGb > budget.maxStorageGb) {
    status = 'EXCEEDED';
    alerts.push(
      `BUDGET EXCEEDED: R2 storage (${totalGb.toFixed(3)} GB) exceeds configured maxStorageGb (${budget.maxStorageGb} GB).`
    );
  } else if (totalGb > budget.warnStorageGb) {
    if (status === 'OK') status = 'WARNING';
    alerts.push(
      `STORAGE WARNING: R2 storage (${totalGb.toFixed(3)} GB) is above warn threshold (${budget.warnStorageGb} GB / ${free.storageGbMonth} GB Free Tier).`
    );
  }

  if (estimatedClassAOps > budget.maxClassAOpsMonth) {
    status = 'EXCEEDED';
    alerts.push(
      `BUDGET EXCEEDED: Estimated Class A ops (${estimatedClassAOps.toLocaleString()}/mo) exceeds max (${budget.maxClassAOpsMonth.toLocaleString()}).`
    );
  } else if (estimatedClassAOps > budget.warnClassAOpsMonth) {
    if (status === 'OK') status = 'WARNING';
    alerts.push(
      `OPS WARNING: Estimated Class A ops (${estimatedClassAOps.toLocaleString()}/mo) exceeds warn threshold (${budget.warnClassAOpsMonth.toLocaleString()}).`
    );
  }

  if (estimatedClassBOps > budget.maxClassBOpsMonth) {
    status = 'EXCEEDED';
    alerts.push(
      `BUDGET EXCEEDED: Estimated Class B ops (${estimatedClassBOps.toLocaleString()}/mo) exceeds max (${budget.maxClassBOpsMonth.toLocaleString()}).`
    );
  } else if (estimatedClassBOps > budget.warnClassBOpsMonth) {
    if (status === 'OK') status = 'WARNING';
    alerts.push(
      `OPS WARNING: Estimated Class B ops (${estimatedClassBOps.toLocaleString()}/mo) exceeds warn threshold (${budget.warnClassBOpsMonth.toLocaleString()}).`
    );
  }

  if (estimatedMonthlyCostUsd > budget.maxMonthlyCostUsd) {
    status = 'EXCEEDED';
    alerts.push(
      `COST EXCEEDED: Estimated monthly cost ($${estimatedMonthlyCostUsd}) exceeds configured budget ($${budget.maxMonthlyCostUsd.toFixed(2)}).`
    );
  }

  const avgVideoBundleBytes =
    r2Objects.length > 0 ? Math.max(15 * 1024 * 1024, Math.round(totalBytes / Math.max(1, r2Objects.length / 2))) : 20 * 1024 * 1024;
  const remainingFreeBytes = Math.max(0, free.storageGbMonth * 1e9 - totalBytes);
  const additionalVideosInFreeTier = Math.floor(remainingFreeBytes / avgVideoBundleBytes);

  return {
    status,
    totalObjects: r2Objects.length,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalGb: Number(totalGb.toFixed(4)),
    freeTierStoragePercent: Number(((totalGb / free.storageGbMonth) * 100).toFixed(2)),
    estimatedClassAOps,
    freeTierClassAPercent: Number(((estimatedClassAOps / free.classAOperationsMonth) * 100).toFixed(2)),
    estimatedClassBOps,
    freeTierClassBPercent: Number(((estimatedClassBOps / free.classBOperationsMonth) * 100).toFixed(2)),
    egressCostUsd: 0,
    estimatedMonthlyCostUsd,
    additionalVideosInFreeTier,
    trafficAssumptions: traffic,
    alerts,
  };
}

/**
 * Builds the complete R2 delivery plan from `media-manifest.json` and updates rendition URLs.
 */
export function buildR2DeliveryPlan({
  manifestPath = DEFAULT_MEDIA_MANIFEST,
  customDomain = null,
  visitorsOverride = null,
  updateManifestUrls = true,
}) {
  const config = loadR2Config(customDomain);
  if (!existsSync(manifestPath)) {
    return {
      config,
      objects: [],
      pagesAssets: [],
      budgetReport: estimateR2Budget({ config, r2Objects: [], visitorsOverride }),
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const items = manifest.items ?? {};
  const r2Objects = [];
  const pagesAssets = [];

  for (const [slug, item] of Object.entries(items)) {
    const collectionSlug = item.collection || null;
    const renditions = item.renditions ?? {};

    for (const [presetId, rend] of Object.entries(renditions)) {
      const absLocal = rend.localPath ? resolve(ROOT, rend.localPath) : null;
      const exists = Boolean(absLocal && existsSync(absLocal));
      const ext = absLocal ? extname(absLocal).toLowerCase() : presetId === 'poster' ? '.webp' : '.mp4';
      const hash8 = rend.hash8 || (exists ? computeFileHash8(absLocal) : 'v1');
      const sizeBytes = rend.sizeBytes ?? (exists ? statSync(absLocal).size : 0);

      const target = buildR2ObjectTarget({
        config,
        collectionSlug,
        videoSlug: slug,
        presetId,
        ext,
        hash8,
      });

      if (target.deliveryProvider === 'pages') {
        pagesAssets.push({
          slug,
          presetId,
          localPath: rend.publicPath ? `public${rend.publicPath}` : rend.localPath,
          publicUrl: target.publicUrl,
          mimeType: target.mimeType,
          cacheControl: target.cacheControl,
          sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
        });
        rend.url = target.publicUrl;
        rend.deliveryProvider = 'pages';
      } else {
        const faststart =
          ext === '.mp4' && exists ? inspectIsoBmffBoxes(absLocal).faststart : Boolean(rend.faststart ?? true);
        const wranglerCmd = `wrangler r2 object put "${config.bucketName}/${target.objectKey}" --file "${rend.localPath}" --content-type "${target.mimeType}" --cache-control "${target.cacheControl}"`;

        r2Objects.push({
          slug,
          collection: collectionSlug,
          presetId,
          localPath: rend.localPath,
          existsOnDisk: exists,
          objectKey: target.objectKey,
          publicUrl: target.publicUrl,
          mimeType: target.mimeType,
          cacheControl: target.cacheControl,
          sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
          faststart,
          hash8,
          wranglerCommand: wranglerCmd,
        });
        rend.objectKey = target.objectKey;
        rend.url = target.publicUrl;
        rend.deliveryProvider = 'r2';
        rend.cacheControl = target.cacheControl;
        rend.mimeType = target.mimeType;
      }
    }

    // Populate top-level convenience URLs for content integration
    item.deliveryProvider = 'r2';
    if (renditions.poster?.url) item.poster = renditions.poster.url;
    if (renditions['hover-preview']?.url) item.previewUrl = renditions['hover-preview'].url;
    else if (renditions['hero-ambient']?.url) item.previewUrl = renditions['hero-ambient'].url;

    if (renditions['web-high-quality']?.url) item.playbackUrl = renditions['web-high-quality'].url;
    else if (renditions['web-standard']?.url) item.playbackUrl = renditions['web-standard'].url;
  }

  const budgetReport = estimateR2Budget({ config, r2Objects, visitorsOverride });

  const plan = {
    generatedAt: new Date().toISOString(),
    bucketName: config.bucketName,
    customDomain: config.customDomain,
    storageClass: config.storageClass,
    budgetReport,
    r2Objects,
    pagesAssets,
  };

  mkdirSync(resolve(DEFAULT_PLAN_OUT, '..'), { recursive: true });
  writeFileSync(DEFAULT_PLAN_OUT, JSON.stringify(plan, null, 2) + '\n');

  if (updateManifestUrls) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  return plan;
}

/**
 * Spins up an ephemeral local HTTP server implementing R2-compatible HTTP Range (`206 Partial Content`),
 * CORS, and Cache-Control headers, then verifies Safari/iPhone initial `bytes=0-1` probe,
 * `moov` header fetch (`bytes=0-65535`), and mid-stream seeking on every MP4 file.
 */
export async function verifyHttpRangePlayback(filePaths, config = loadR2Config()) {
  const validFiles = filePaths.map((f) => resolve(f)).filter((f) => existsSync(f));
  if (validFiles.length === 0) {
    return [];
  }

  const fileMap = new Map();
  validFiles.forEach((absPath, idx) => {
    fileMap.set(`/video-${idx}.mp4`, absPath);
  });

  const allowedOrigin = config.siteOrigins?.[0] ?? 'https://creative.example.com';

  const server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    const targetFile = fileMap.get(urlPath);
    if (!targetFile || !existsSync(targetFile)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const stat = statSync(targetFile);
    const total = stat.size;
    const baseHeaders = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${total.toString(16)}"`,
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since, Content-Type',
      'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, ETag',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, baseHeaders);
      res.end();
      return;
    }

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
      if (req.method === 'HEAD') return res.end();
      createReadStream(targetFile).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }

    const chunkLength = end - start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': chunkLength,
    });

    if (req.method === 'HEAD') return res.end();
    createReadStream(targetFile, { start, end }).pipe(res);
  });

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results = [];
  try {
    for (const [route, absPath] of fileMap.entries()) {
      const url = `${baseUrl}${route}`;
      const stat = statSync(absPath);
      const boxInfo = inspectIsoBmffBoxes(absPath);
      const inspectInfo = inspectMediaFile(absPath, 'web-standard');

      // Probe 1: Safari / iOS mandatory 2-byte probe (`Range: bytes=0-1`)
      const probe1 = await fetch(url, {
        headers: { Range: 'bytes=0-1', Origin: allowedOrigin },
      });
      const probe1Buf = Buffer.from(await probe1.arrayBuffer());
      const safari2BytePass =
        probe1.status === 206 &&
        probe1.headers.get('accept-ranges') === 'bytes' &&
        probe1.headers.get('content-range') === `bytes 0-1/${stat.size}` &&
        probe1Buf.length === 2;

      // Probe 2: Initial 64KB header fetch (`Range: bytes=0-65535`) — checks if `moov` atom is inside first chunk
      const headEnd = Math.min(65535, stat.size - 1);
      const probe2 = await fetch(url, {
        headers: { Range: `bytes=0-${headEnd}`, Origin: allowedOrigin },
      });
      const probe2Buf = Buffer.from(await probe2.arrayBuffer());
      const containsMoovInFirstChunk = probe2Buf.includes(Buffer.from('moov', 'ascii'));

      // Probe 3: Mid-file random seek (`Range: bytes=mid..mid+16383`)
      const midStart = Math.floor(stat.size / 2);
      const midEnd = Math.min(midStart + 16383, stat.size - 1);
      const probe3 = await fetch(url, {
        headers: { Range: `bytes=${midStart}-${midEnd}`, Origin: allowedOrigin },
      });
      const probe3Buf = Buffer.from(await probe3.arrayBuffer());
      const seekPass =
        probe3.status === 206 &&
        probe3.headers.get('content-range') === `bytes ${midStart}-${midEnd}/${stat.size}` &&
        probe3Buf.length === midEnd - midStart + 1;

      // Probe 4: CORS Expose-Headers check
      const exposeHeaders = probe1.headers.get('access-control-expose-headers') ?? '';
      const corsPass =
        probe1.headers.get('access-control-allow-origin') === allowedOrigin &&
        exposeHeaders.includes('Content-Range') &&
        exposeHeaders.includes('Accept-Ranges');

      results.push({
        file: relative(ROOT, absPath),
        fileName: basename(absPath),
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        orientation: inspectInfo.video?.orientation ?? 'unknown',
        resolution: inspectInfo.video ? `${inspectInfo.video.width}×${inspectInfo.video.height}` : 'unknown',
        faststartAtomOrder: boxInfo.faststart,
        safariIosPlayable: Boolean(inspectInfo.compatibility?.safariIosPlayable && safari2BytePass),
        safari2ByteProbe206: safari2BytePass,
        moovInInitialRange: Boolean(boxInfo.faststart && containsMoovInFirstChunk),
        randomSeek206: seekPass,
        corsRangeHeadersPass: corsPass,
        allPassed: Boolean(
          boxInfo.faststart &&
          inspectInfo.compatibility?.safariIosPlayable &&
          safari2BytePass &&
          seekPass &&
          corsPass
        ),
      });
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  return results;
}

function parseCliArgs(argv) {
  const args = {
    manifest: DEFAULT_MEDIA_MANIFEST,
    domain: null,
    visitors: null,
    verifyRange: argv.includes('--verify-range'),
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest' && argv[i + 1]) args.manifest = resolve(argv[++i]);
    else if (a === '--domain' && argv[i + 1]) args.domain = argv[++i];
    else if (a === '--visitors' && argv[i + 1]) args.visitors = Number(argv[++i]);
    else if (a === '--file' && argv[i + 1]) args.files.push(resolve(argv[++i]));
    else if (a === '--verify-range') args.verifyRange = true;
    else if (!a.startsWith('-')) args.files.push(resolve(a));
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  const plan = buildR2DeliveryPlan({
    manifestPath: args.manifest,
    customDomain: args.domain,
    visitorsOverride: args.visitors,
    updateManifestUrls: true,
  });

  const b = plan.budgetReport;
  console.log('\n=== Round 03.1 — Cloudflare R2 Delivery Plan & Budget Audit ===');
  console.log(`Bucket & Class : ${plan.bucketName} (${plan.storageClass})`);
  console.log(`Custom Domain  : ${plan.customDomain} (Egress: $0.00 via Cloudflare CDN)`);
  console.log(`R2 Video Files : ${b.totalObjects} object(s) · ${b.totalFormatted} (${b.totalGb} GB / 10 GB Free Tier = ${b.freeTierStoragePercent}%)`);
  console.log(`Pages Posters  : ${plan.pagesAssets.length} WebP poster(s)`);
  console.log(
    `Monthly Ops Est: Class A=${b.estimatedClassAOps.toLocaleString()} (${b.freeTierClassAPercent}% of 1M free) · Class B=${b.estimatedClassBOps.toLocaleString()} (${b.freeTierClassBPercent}% of 10M free)`
  );
  console.log(`Projected Cost : $${b.estimatedMonthlyCostUsd.toFixed(2)} / month [Status: ${b.status}]`);
  console.log(`Free Capacity  : Room for ~${b.additionalVideosInFreeTier} more optimized video bundles inside the 10 GB Free Tier`);

  if (plan.r2Objects.length > 0) {
    console.log('\nPrepared R2 Objects (Dry-run — no production upload executed):');
    for (const obj of plan.r2Objects) {
      console.log(
        `  • [${obj.presetId}] ${obj.objectKey} (${obj.sizeFormatted}, faststart=${obj.faststart}) -> ${obj.publicUrl}`
      );
    }
  }

  if (b.alerts.length > 0) {
    console.log('\nBudget Alerts:');
    for (const alert of b.alerts) console.warn(`  ⚠ ${alert}`);
  } else {
    console.log('\n✓ Storage and operations are well within Cloudflare R2 Free Tier and configured budget.');
  }

  if (args.verifyRange) {
    const candidateFiles =
      args.files.length > 0
        ? args.files
        : plan.r2Objects
          .filter((o) => o.existsOnDisk && o.localPath?.endsWith('.mp4'))
          .map((o) => resolve(ROOT, o.localPath));

    if (candidateFiles.length > 0) {
      const rangeResults = await verifyHttpRangePlayback(candidateFiles);
      console.log('\n=== HTTP Range & Safari/iPhone Playback Verification ===');
      for (const r of rangeResults) {
        const icon = r.allPassed ? '✓ PASS' : '✖ FAIL';
        console.log(
          `  ${icon} ${r.fileName} (${r.resolution} ${r.orientation}, ${r.sizeFormatted}) | faststart=${r.faststartAtomOrder} | Safari 0-1 206=${r.safari2ByteProbe206} | RandomSeek 206=${r.randomSeek206} | CORS=${r.corsRangeHeadersPass}`
        );
      }
    } else {
      console.log('\n(No local MP4 files queued for HTTP Range verification yet. Pass `--file <path.mp4>` or encode media first.)');
    }
  }
}
