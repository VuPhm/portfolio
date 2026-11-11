#!/usr/bin/env node
/**
 * Content & Production Integrity Validator — Round 03.1
 *
 * Audits:
 *  1. Content entries (`src/content/collections/*.md` & `src/content/videos/*.md`) or a manifest (`--manifest <path>`):
 *     - Duplicate slugs, duplicate video URLs, duplicate titles inside a collection
 *     - Missing thumbnail / cover images in `public/`
 *     - Broken collection references & invalid video URLs (plus optional `--check-remote` HTTP check)
 *     - Round 03.1 media guardrails:
 *       • Blocks Google Drive direct links in `url` / `playbackUrl` / `previewUrl` (must be in `masterSource`)
 *       • Blocks animated `.gif` in posters, hover previews, or playback URLs
 *       • Validates `deliveryProvider` and `renditions` metadata
 *  2. Built output (`--check-dist` on `dist/`):
 *     - Verifies `demoPreview = false` production integrity:
 *       • Demo collections & videos never appear in public HTML
 *       • No static HTML pages generated for demo collections, demo videos, or legacy demo `/works/[slug]`
 *       • No demo entries in `dist/sitemap.xml`, SEO metadata, or internal links
 *       • Empty states render cleanly and no fake statistics or `DEMO` badges appear in public build
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const DIST_DIR = join(ROOT, 'dist');
const COLLECTIONS_DIR = join(ROOT, 'src', 'content', 'collections');
const VIDEOS_DIR = join(ROOT, 'src', 'content', 'videos');
const VALID_DELIVERY_PROVIDERS = new Set(['r2', 'pages', 'youtube', 'vimeo', 'external', 'none']);

/** Simple YAML frontmatter parser for our content markdown files. */
function parseFrontmatter(mdText) {
  const match = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const data = {};
  const lines = yaml.split(/\r?\n/);
  let currentKey = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();

    if (indent > 0 && currentKey) {
      const subMatch = line.match(/^([^:]+):\s*(.*)$/);
      if (subMatch) {
        const subKey = subMatch[1].trim().replace(/^["']|["']$/g, '');
        const subVal = parseYamlScalar(subMatch[2].trim());
        if (typeof data[currentKey] !== 'object' || data[currentKey] === null || Array.isArray(data[currentKey])) {
          data[currentKey] = {};
        }
        data[currentKey][subKey] = subVal;
      }
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const valStr = kvMatch[2].trim();
      currentKey = key;
      if (valStr === '') {
        data[key] = {};
      } else {
        data[key] = parseYamlScalar(valStr);
      }
    }
  }
  return data;
}

function parseYamlScalar(valStr) {
  if (valStr === 'true') return true;
  if (valStr === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(valStr)) return Number(valStr);
  if ((valStr.startsWith('[') && valStr.endsWith(']')) || (valStr.startsWith('{') && valStr.endsWith('}'))) {
    try {
      return JSON.parse(valStr);
    } catch {
      if (valStr.startsWith('[')) {
        return valStr
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    }
  }
  if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
    return valStr.slice(1, -1);
  }
  return valStr;
}

function loadMarkdownEntries(dirPath) {
  if (!existsSync(dirPath)) return [];
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const slug = basename(file, '.md');
    const content = readFileSync(join(dirPath, file), 'utf8');
    const data = parseFrontmatter(content);
    return { slug, file, data };
  });
}

function loadManifestEntries(manifestPath) {
  const abs = resolve(manifestPath);
  if (!existsSync(abs)) {
    throw new Error(`Manifest file not found: ${abs}`);
  }
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const collections = (raw.collections ?? []).map((c, idx) => ({
    slug: c.slug || `collection-${idx + 1}`,
    file: abs,
    data: c,
  }));
  const videos = (raw.videos ?? []).map((v, idx) => ({
    slug: v.slug || `video-${idx + 1}`,
    file: abs,
    data: v,
  }));
  return { collections, videos };
}

function isValidUrlOrPath(str) {
  if (!str) return true;
  if (str.startsWith('/')) return true;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isGoogleDriveUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (/^gdrive:\/\//i.test(trimmed)) return true;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'drive.usercontent.google.com'
    );
  } catch {
    return false;
  }
}

function isAnimatedGif(str) {
  return typeof str === 'string' && /\.gif(\?.*)?$/i.test(str.trim());
}

async function validateContent({ checkRemote = false, manifestPath = null } = {}) {
  const { collections, videos } = manifestPath
    ? loadManifestEntries(manifestPath)
    : {
      collections: loadMarkdownEntries(COLLECTIONS_DIR),
      videos: loadMarkdownEntries(VIDEOS_DIR),
    };

  const errors = [];
  const warnings = [];

  const collectionMap = new Map();
  for (const c of collections) {
    if (collectionMap.has(c.slug)) {
      errors.push(`Duplicate collection slug: "${c.slug}"`);
    }
    collectionMap.set(c.slug, c);

    const coverSrc = typeof c.data.cover === 'string' ? c.data.cover : c.data.cover?.src || c.data.thumbnail;
    if (!coverSrc) {
      errors.push(`Collection "${c.slug}" is missing cover/thumbnail.`);
    } else if (isAnimatedGif(coverSrc)) {
      errors.push(`Collection "${c.slug}" uses an animated GIF cover (${coverSrc}); use WebP/AVIF/JPG.`);
    } else if (!manifestPath && coverSrc.startsWith('/') && !existsSync(join(PUBLIC_DIR, coverSrc))) {
      errors.push(`Collection "${c.slug}" cover file missing on disk: public${coverSrc}`);
    }
  }

  const seenVideoUrls = new Map();
  const seenTitlesPerCollection = new Map();

  for (const v of videos) {
    const d = v.data;
    const posterSrc = typeof d.poster === 'string' ? d.poster : d.poster?.src || d.thumbnail;
    if (!posterSrc) {
      errors.push(`Video "${v.slug}" is missing poster/thumbnail.`);
    } else if (isAnimatedGif(posterSrc)) {
      errors.push(`Video "${v.slug}" uses a GIF poster (${posterSrc}); use WebP/AVIF/JPG.`);
    } else if (!manifestPath && posterSrc.startsWith('/') && !existsSync(join(PUBLIC_DIR, posterSrc))) {
      errors.push(`Video "${v.slug}" poster file missing on disk: public${posterSrc}`);
    }

    // Round 03.1 checks: deliveryProvider, previewUrl, playbackUrl, url, masterSource
    if (d.deliveryProvider && !VALID_DELIVERY_PROVIDERS.has(String(d.deliveryProvider))) {
      errors.push(
        `Video "${v.slug}" has invalid deliveryProvider "${d.deliveryProvider}". Expected one of: ${[
          ...VALID_DELIVERY_PROVIDERS,
        ].join(', ')}`
      );
    }

    for (const field of ['playbackUrl', 'url', 'source', 'previewUrl']) {
      const val = d[field];
      if (!val || typeof val !== 'string') continue;
      if (isGoogleDriveUrl(val)) {
        errors.push(
          `Video "${v.slug}" uses a Google Drive URL in \`${field}\` (${val}). Store master sources in \`masterSource\` and deliver compressed video via Cloudflare R2 or YouTube/Vimeo.`
        );
      }
      if (isAnimatedGif(val)) {
        errors.push(
          `Video "${v.slug}" uses an animated GIF in \`${field}\` (${val}). Round 03.1 requires muted MP4 hover previews and WebP posters.`
        );
      }
    }

    const videoUrl = d.playbackUrl || d.url || d.source;
    if (videoUrl) {
      if (!isValidUrlOrPath(videoUrl)) {
        errors.push(`Video "${v.slug}" has invalid URL/playbackUrl: "${videoUrl}"`);
      } else if (!manifestPath && videoUrl.startsWith('/') && !existsSync(join(PUBLIC_DIR, videoUrl))) {
        errors.push(`Video "${v.slug}" references local file missing on disk: public${videoUrl}`);
      }
      if (seenVideoUrls.has(videoUrl)) {
        warnings.push(
          `Duplicate video URL "${videoUrl}" found in "${v.slug}" and "${seenVideoUrls.get(videoUrl)}". Define the video once and add multiple slugs to its \`collections\` array.`
        );
      } else {
        seenVideoUrls.set(videoUrl, v.slug);
      }

      if (checkRemote && /^https?:\/\//i.test(videoUrl)) {
        try {
          const res = await fetch(videoUrl, { method: 'HEAD', redirect: 'follow' });
          if (!res.ok && res.status !== 405 && res.status !== 403) {
            warnings.push(`Remote URL check returned HTTP ${res.status} for video "${v.slug}": ${videoUrl}`);
          }
        } catch (err) {
          warnings.push(`Remote URL unreachable for video "${v.slug}" (${videoUrl}): ${err.message}`);
        }
      }
    }

    const refs = Array.isArray(d.collections)
      ? d.collections
      : typeof d.collections === 'string' && d.collections
        ? d.collections.split(',').map((s) => s.trim())
        : [];

    for (const ref of refs) {
      const target = collectionMap.get(ref);
      if (!target) {
        errors.push(`Video "${v.slug}" references non-existent collection "${ref}".`);
      } else if (!d.demo && (d.status ?? 'published') === 'published' && target.data.demo) {
        warnings.push(`Real video "${v.slug}" references demo collection "${ref}".`);
      }

      const key = `${ref}::${String(d.title || '').toLowerCase()}`;
      if (seenTitlesPerCollection.has(key)) {
        warnings.push(
          `Collection "${ref}" has duplicate video title "${d.title}" (${v.slug} & ${seenTitlesPerCollection.get(key)}).`
        );
      } else {
        seenTitlesPerCollection.set(key, v.slug);
      }
    }
  }

  const realCollections = collections.filter((c) => !c.data.demo && (c.data.status ?? 'published') === 'published');
  const realVideos = videos.filter((v) => !v.data.demo && (v.data.status ?? 'published') === 'published');
  const demoCollections = collections.filter((c) => c.data.demo);
  const demoVideos = videos.filter((v) => v.data.demo);
  const draftVideos = videos.filter((v) => v.data.status === 'draft');

  console.log('=== Content & Media Delivery Audit (Round 03.1) ===');
  if (manifestPath) console.log(`Manifest file  : ${manifestPath}`);
  console.log(`Real published : ${realCollections.length} collection(s), ${realVideos.length} video(s)`);
  console.log(`Demo entries   : ${demoCollections.length} collection(s), ${demoVideos.length} video(s)`);
  console.log(`Draft entries  : ${draftVideos.length} video(s)`);

  return { errors, warnings, collections, videos, demoCollections, demoVideos, realCollections, realVideos };
}

function listHtmlAndXmlFiles(dir, base = '') {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listHtmlAndXmlFiles(full, rel));
    } else if (entry.isFile() && /\.(html|xml)$/i.test(entry.name)) {
      results.push({ rel, full });
    }
  }
  return results;
}

function validateDistBuild(audit) {
  const errors = [];
  if (!existsSync(DIST_DIR)) {
    errors.push('dist/ directory does not exist. Run `pnpm build` first.');
    return errors;
  }

  const builtFiles = listHtmlAndXmlFiles(DIST_DIR);
  const demoSlugs = new Set([
    ...audit.demoCollections.map((c) => c.slug),
    ...audit.demoVideos.map((v) => v.slug),
    '01-kinetic-silence',
    '02-nocturne-in-24-frames',
    '03-fragments-of-form',
    '04-pulse-vertical-study',
    '05-monolith-chronicle',
    '06-chromatic-drift',
  ]);

  // 1. Check that no demo route HTML exists in dist/
  for (const { rel, full } of builtFiles) {
    for (const slug of demoSlugs) {
      if (rel.includes(`/${slug}/`) || rel.startsWith(`${slug}/`) || rel === `${slug}.html`) {
        errors.push(`Demo static page was generated in dist/: ${rel}`);
      }
    }

    // 2. Check that no HTML/XML content in dist/ references demo routes or DEMO badges when demoPreview=false
    const text = readFileSync(full, 'utf8');
    for (const slug of demoSlugs) {
      if (
        text.includes(`/collections/${slug}`) ||
        text.includes(`/videos/${slug}`) ||
        text.includes(`/works/${slug}`) ||
        text.includes(`/media/posters/${slug}.svg`) ||
        text.includes(`/media/covers/${slug}.svg`)
      ) {
        errors.push(`Built file "dist/${rel}" leaks reference to demo slug "${slug}".`);
      }
    }

    if (text.includes('<span class="stat-badge">DEMO</span>')) {
      errors.push(`Built file "dist/${rel}" contains a DEMO badge in production build.`);
    }
  }

  // 3. Check 404.html and sitemap.xml exist
  if (!existsSync(join(DIST_DIR, '404.html'))) {
    errors.push('dist/404.html is missing (required so old demo URLs never return sample content).');
  }
  if (!existsSync(join(DIST_DIR, 'sitemap.xml'))) {
    errors.push('dist/sitemap.xml is missing.');
  }

  // 4. When 0 real items exist, verify empty state is rendered in index.html & works/index.html
  if (audit.realCollections.length === 0 && audit.realVideos.length === 0) {
    const homeHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
    const worksHtml = readFileSync(join(DIST_DIR, 'works', 'index.html'), 'utf8');
    if (!homeHtml.includes('empty-stage')) {
      errors.push('dist/index.html is missing the empty-state stage when 0 real entries exist.');
    }
    if (!worksHtml.includes('empty-stage')) {
      errors.push('dist/works/index.html is missing the empty-state stage when 0 real entries exist.');
    }
  }

  console.log(`\n=== Production Build Integrity (dist/) ===`);
  console.log(`Built HTML/XML files inspected: ${builtFiles.length}`);
  for (const f of builtFiles) {
    console.log(`  • dist/${f.rel}`);
  }

  return errors;
}

async function main() {
  const argv = process.argv.slice(2);
  const checkDist = argv.includes('--check-dist');
  const checkRemote = argv.includes('--check-remote');
  let manifestPath = null;
  const mIdx = argv.indexOf('--manifest');
  if (mIdx !== -1 && argv[mIdx + 1]) {
    manifestPath = argv[mIdx + 1];
  }

  const audit = await validateContent({ checkRemote, manifestPath });
  const allErrors = [...audit.errors];

  if (checkDist) {
    allErrors.push(...validateDistBuild(audit));
  }

  if (audit.warnings.length > 0) {
    console.log(`\nWarnings (${audit.warnings.length}):`);
    for (const w of audit.warnings) console.log(`  ⚠ ${w}`);
  }

  if (allErrors.length > 0) {
    console.error(`\nValidation FAILED with ${allErrors.length} error(s):`);
    for (const e of allErrors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }

  console.log('\n✓ All content, media delivery, and production integrity checks passed.');
}

main();
