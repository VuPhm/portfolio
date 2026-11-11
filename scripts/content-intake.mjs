#!/usr/bin/env node
/**
 * Batch Content Intake Tool — Round 03.1 (Media Optimization & Cloudflare Delivery)
 *
 * Reads a JSON manifest, CSV manifest, plain-text link list, or organized directory (read-only),
 * optionally merges prepared renditions from `media-workspace/media-manifest.json`,
 * enforces the 3-layer storage separation (Source -> Optimized -> Delivery),
 * prevents Google Drive direct URLs from being used as public HTML5 <video> sources,
 * and generates Astro content entries.
 *
 * Safety guarantees:
 *  - NEVER moves, compresses, deletes, or uploads original master video files.
 *  - Defaults to dry-run preview unless `--write` or `--out <manifest.json>` is passed.
 *
 * Usage:
 *  pnpm content:intake --from content-intake/manifest.template.json
 *  pnpm content:intake --from content-intake/manifest.template.csv
 *  pnpm content:intake --from content-intake/links.template.txt
 *  pnpm content:intake --scan /path/to/organized-folder
 *  pnpm content:intake --from content-intake/manifest.json --write
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const COLLECTIONS_DIR = join(ROOT, 'src', 'content', 'collections');
const VIDEOS_DIR = join(ROOT, 'src', 'content', 'videos');
const DEFAULT_MEDIA_MANIFEST = join(ROOT, 'media-workspace', 'media-manifest.json');
const IMAGE_EXTS = ['.webp', '.avif', '.jpg', '.jpeg', '.png', '.svg'];
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const VALID_DELIVERY_PROVIDERS = new Set(['r2', 'pages', 'youtube', 'vimeo', 'external', 'none']);

function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleFromSlug(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeOrientation(raw, fallbackKind) {
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['9:16', 'portrait', 'vertical', 'short', 'shorts', 'reel'].includes(v)) return 'portrait';
    if (['16:9', 'landscape', 'horizontal', 'widescreen', 'film'].includes(v)) return 'landscape';
  }
  return fallbackKind === 'channel' ? 'portrait' : 'landscape';
}

function normalizeKind(raw) {
  const v = String(raw ?? 'series').trim().toLowerCase();
  if (v === 'campaign' || v === 'brand') return 'brand';
  if (v === 'channel' || v === 'shorts' || v === 'vertical') return 'channel';
  return 'series';
}

function normalizeStatus(status, draft) {
  if (typeof draft === 'boolean') return draft ? 'draft' : 'published';
  const s = String(status ?? 'published').trim().toLowerCase();
  return s === 'draft' ? 'draft' : 'published';
}

export function isGoogleDriveLink(url) {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return false;
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

function inferDeliveryProvider(playbackUrl, explicitProvider) {
  if (explicitProvider && VALID_DELIVERY_PROVIDERS.has(explicitProvider)) {
    return explicitProvider;
  }
  const u = String(playbackUrl ?? '').trim();
  if (!u) return 'none';
  if (u.startsWith('/')) return 'pages';
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      return 'youtube';
    }
    if (host.endsWith('vimeo.com')) return 'vimeo';
    if (/\.(mp4|m4v|webm|mov)(\?.*)?$/i.test(u)) return 'r2';
    return 'external';
  } catch {
    return 'none';
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      return u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop() ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveExistingThumbnail(kind, slug, explicitPath) {
  if (explicitPath && explicitPath.trim()) {
    const src = explicitPath.trim();
    const onDisk = src.startsWith('/') ? existsSync(join(PUBLIC_DIR, src)) : /^https?:\/\//i.test(src);
    return { src, exists: onDisk, suggested: false };
  }

  const folder = kind === 'collection' ? 'covers' : 'posters';
  for (const ext of IMAGE_EXTS) {
    const candidate = `/media/${folder}/${slug}${ext}`;
    if (existsSync(join(PUBLIC_DIR, candidate))) {
      return { src: candidate, exists: true, suggested: true };
    }
  }

  return {
    src: `/media/${folder}/${slug}.webp`,
    exists: false,
    suggested: true,
  };
}

/** Simple RFC-4180 compatible CSV line parser. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsvManifest(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return { collections: [], videos: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const collectionsMap = new Map();
  const videos = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? '';
    });

    const colSlugs = (row.collections || row.collection || '')
      .split(/[,;|]/)
      .map((s) => slugify(s))
      .filter(Boolean);
    const rowKind = row.collection_kind || row.kind || 'series';

    for (const cSlug of colSlugs) {
      if (!collectionsMap.has(cSlug) && cSlug !== 'standalone') {
        collectionsMap.set(cSlug, {
          slug: cSlug,
          title: row.collection_title || titleFromSlug(cSlug),
          kind: normalizeKind(rowKind),
          status: 'published',
          featured: true,
          order: collectionsMap.size + 1,
        });
      }
    }

    videos.push({
      slug: row.slug ? slugify(row.slug) : slugify(row.title || `video-${i}`),
      title: row.title || titleFromSlug(row.slug || `video-${i}`),
      masterSource: row.mastersource || row.master_source || undefined,
      playbackUrl: row.playbackurl || row.playback_url || undefined,
      previewUrl: row.previewurl || row.preview_url || undefined,
      deliveryProvider: row.deliveryprovider || row.delivery_provider || undefined,
      source: row.source || row.url || '',
      thumbnail: row.thumbnail || row.poster || '',
      orientation: row.orientation || (rowKind === 'channel' ? '9:16' : '16:9'),
      collections: colSlugs.filter((c) => c !== 'standalone'),
      order: row.order ? Number(row.order) : i,
      featured: /^(true|1|yes|featured)$/i.test(row.featured || ''),
      status: row.status || 'published',
      duration: row.duration || undefined,
      year: row.year || undefined,
      role: row.role || undefined,
      client: row.client || undefined,
      description: row.description || undefined,
    });
  }

  return {
    collections: [...collectionsMap.values()],
    videos,
  };
}

function parseLinksTxt(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const collections = [];
  const videos = [];
  let currentCollection = null;
  let itemOrder = 1;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const headerMatch = line.match(/^\[([^\]]+)\]$/);
    if (headerMatch) {
      const parts = headerMatch[1].split('|').map((p) => p.trim());
      const first = parts[0];
      if (/^standalone$/i.test(first)) {
        currentCollection = null;
        itemOrder = 1;
        continue;
      }
      const [rawKind, rawTitle] = first.includes(':')
        ? first.split(':').map((s) => s.trim())
        : ['series', first];
      const meta = {};
      for (const p of parts.slice(1)) {
        const [k, v] = p.split('=').map((s) => s.trim());
        if (k && v) meta[k.toLowerCase()] = v;
      }
      const slug = meta.slug ? slugify(meta.slug) : slugify(rawTitle || `collection-${collections.length + 1}`);
      currentCollection = {
        slug,
        title: rawTitle || titleFromSlug(slug),
        kind: normalizeKind(rawKind),
        status: normalizeStatus(meta.status, undefined),
        featured: meta.featured ? /^(true|1|yes)$/i.test(meta.featured) : true,
        order: meta.order ? Number(meta.order) : collections.length + 1,
        year: meta.year,
        tagline: meta.tagline,
        thumbnail: meta.thumbnail || meta.cover,
      };
      collections.push(currentCollection);
      itemOrder = 1;
      continue;
    }

    const parts = line.split('|').map((p) => p.trim());
    const source = parts[0];
    const title = parts[1] || titleFromSlug(basename(source, extname(source)));
    const orientRaw = parts[2] || (currentCollection?.kind === 'channel' ? '9:16' : '16:9');
    const duration = parts[3] && !/^featured$/i.test(parts[3]) ? parts[3] : undefined;
    const featured = parts.some((p) => /^featured$/i.test(p));
    const slug = slugify(title);

    videos.push({
      slug,
      title,
      source,
      orientation: orientRaw,
      collections: currentCollection ? [currentCollection.slug] : [],
      order: itemOrder++,
      featured,
      status: 'published',
      duration,
      year: currentCollection?.year,
    });
  }

  return { collections, videos };
}

/**
 * Scans an organized directory in READ-ONLY mode.
 * Records master files in `masterSource` (Source layer) without copying heavy files into `public/`.
 */
function scanOrganizedDirectory(dirPath) {
  const abs = resolve(dirPath);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`Directory not found: ${abs}`);
  }

  const collections = [];
  const videos = [];
  const topEntries = readdirSync(abs, { withFileTypes: true }).filter((d) => !d.name.startsWith('.'));

  function collectVideosFromDir(folderPath, collectionSlug, fallbackKind) {
    const files = readdirSync(folderPath, { withFileTypes: true }).filter((f) => f.isFile() && !f.name.startsWith('.'));
    let order = 1;
    for (const file of files) {
      const ext = extname(file.name).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) continue;
      const base = basename(file.name, ext);
      const slug = slugify(base);
      const isVerticalHint = /(9x16|9-16|vertical|portrait|short|reel)/i.test(base);
      const fullPath = join(folderPath, file.name);
      const st = statSync(fullPath);
      videos.push({
        slug,
        title: titleFromSlug(slug),
        source: '',
        masterSource: {
          localPath: fullPath,
          fileName: file.name,
          sizeBytes: st.size,
        },
        localFileHint: fullPath,
        orientation: isVerticalHint ? 'portrait' : normalizeOrientation('', fallbackKind),
        collections: collectionSlug ? [collectionSlug] : [],
        order: order++,
        featured: order === 2,
        status: 'published',
      });
    }
  }

  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const lower = entry.name.toLowerCase();
    if (['series', 'channel', 'channels', 'brand', 'brands', 'campaign', 'campaigns'].includes(lower)) {
      const kind = normalizeKind(lower.replace(/s$/, ''));
      const subDirs = readdirSync(join(abs, entry.name), { withFileTypes: true }).filter(
        (d) => d.isDirectory() && !d.name.startsWith('.')
      );
      for (const sub of subDirs) {
        const cSlug = slugify(sub.name);
        collections.push({
          slug: cSlug,
          title: titleFromSlug(cSlug),
          kind,
          status: 'published',
          featured: true,
          order: collections.length + 1,
        });
        collectVideosFromDir(join(abs, entry.name, sub.name), cSlug, kind);
      }
    } else if (lower === 'standalone' || lower === 'films') {
      collectVideosFromDir(join(abs, entry.name), null, 'series');
    } else {
      const cSlug = slugify(entry.name);
      collections.push({
        slug: cSlug,
        title: titleFromSlug(cSlug),
        kind: 'series',
        status: 'published',
        featured: true,
        order: collections.length + 1,
      });
      collectVideosFromDir(join(abs, entry.name), cSlug, 'series');
    }
  }

  return { collections, videos };
}

/**
 * Normalizes and deduplicates collections and videos, merging any prepared renditions
 * from `media-workspace/media-manifest.json` when available.
 */
function normalizeManifest(raw, mediaManifestItems = {}) {
  const collectionMap = new Map();
  const rawCollections = Array.isArray(raw.collections) ? raw.collections : [];

  for (let i = 0; i < rawCollections.length; i++) {
    const c = rawCollections[i];
    const slug = slugify(c.slug || c.id || c.title || `collection-${i + 1}`);
    const thumb = resolveExistingThumbnail('collection', slug, c.cover?.src ?? c.cover ?? c.thumbnail);
    collectionMap.set(slug, {
      slug,
      title: String(c.title || titleFromSlug(slug)).trim(),
      kind: normalizeKind(c.kind),
      status: normalizeStatus(c.status, c.draft),
      featured: Boolean(c.featured ?? false),
      order: typeof c.order === 'number' && !Number.isNaN(c.order) ? c.order : (i + 1) * 10,
      tagline: c.tagline ? String(c.tagline).trim() : undefined,
      year: c.year ? String(c.year).trim() : undefined,
      client: c.client ? String(c.client).trim() : undefined,
      url: c.url ? String(c.url).trim() : undefined,
      heroVideo: c.heroVideo ? String(c.heroVideo).trim() : undefined,
      cover: {
        src: thumb.src,
        alt: c.cover?.alt || String(c.title || titleFromSlug(slug)).trim(),
        existsOnDisk: thumb.exists,
        suggested: thumb.suggested,
      },
    });
  }

  const videoBySlug = new Map();
  const slugBySource = new Map();
  const mergedDuplicates = [];
  const driveSourceWarnings = [];
  const rawVideos = Array.isArray(raw.videos) ? raw.videos : [];

  for (let i = 0; i < rawVideos.length; i++) {
    const v = rawVideos[i];
    const candidateSlug = slugify(v.slug || v.id || v.title || `video-${i + 1}`);
    const prepared = mediaManifestItems[candidateSlug] ?? null;

    let rawPlaybackUrl = String(v.playbackUrl ?? prepared?.playbackUrl ?? '').trim();
    let rawSource = String(v.url ?? v.source ?? '').trim();
    let masterSource = v.masterSource ?? prepared?.masterSource ?? undefined;

    // Guardrail: Do not allow direct Google Drive URLs as public HTML5 playback sources
    if (isGoogleDriveLink(rawPlaybackUrl)) {
      if (!masterSource) masterSource = { driveUrl: rawPlaybackUrl };
      driveSourceWarnings.push({ slug: candidateSlug, movedUrl: rawPlaybackUrl, field: 'playbackUrl' });
      rawPlaybackUrl = '';
    }
    if (isGoogleDriveLink(rawSource)) {
      if (!masterSource) masterSource = { driveUrl: rawSource };
      driveSourceWarnings.push({ slug: candidateSlug, movedUrl: rawSource, field: 'source/url' });
      rawSource = '';
    }

    const dedupeKeyUrl = rawPlaybackUrl || rawSource;
    const existingSlug =
      (dedupeKeyUrl && slugBySource.get(dedupeKeyUrl)) ||
      (videoBySlug.has(candidateSlug) ? candidateSlug : null);

    const refs = Array.isArray(v.collections)
      ? v.collections.map((r) => slugify(typeof r === 'string' ? r : r.id)).filter(Boolean)
      : typeof v.collections === 'string'
        ? v.collections
          .split(/[,;|]/)
          .map((s) => slugify(s))
          .filter(Boolean)
        : [];

    if (existingSlug && videoBySlug.has(existingSlug)) {
      const existing = videoBySlug.get(existingSlug);
      for (const ref of refs) {
        if (!existing.collections.includes(ref)) {
          existing.collections.push(ref);
        }
        if (typeof v.order === 'number') {
          existing.collectionOrder = existing.collectionOrder || {};
          existing.collectionOrder[ref] = v.order;
        }
      }
      if (v.collectionOrder && typeof v.collectionOrder === 'object') {
        existing.collectionOrder = { ...(existing.collectionOrder || {}), ...v.collectionOrder };
      }
      mergedDuplicates.push({ slug: existingSlug, mergedFrom: candidateSlug, source: dedupeKeyUrl });
      continue;
    }

    // Ensure referenced collections exist in collectionMap or create stub
    for (const ref of refs) {
      if (!collectionMap.has(ref)) {
        const thumb = resolveExistingThumbnail('collection', ref, '');
        collectionMap.set(ref, {
          slug: ref,
          title: titleFromSlug(ref),
          kind: 'series',
          status: 'published',
          featured: true,
          order: (collectionMap.size + 1) * 10,
          cover: {
            src: thumb.src,
            alt: titleFromSlug(ref),
            existsOnDisk: thumb.exists,
            suggested: true,
          },
        });
      }
    }

    const primaryCollection = refs[0] ? collectionMap.get(refs[0]) : null;
    const orientation = normalizeOrientation(
      v.orientation ?? prepared?.orientation,
      primaryCollection?.kind
    );
    const explicitPoster =
      v.poster?.src ?? (typeof v.poster === 'string' ? v.poster : undefined) ?? v.thumbnail ?? prepared?.poster;
    const thumb = resolveExistingThumbnail('video', candidateSlug, explicitPoster);
    const ytId = extractYouTubeId(rawPlaybackUrl || rawSource);

    const effectiveUrl = rawPlaybackUrl || rawSource || undefined;
    const deliveryProvider = inferDeliveryProvider(
      effectiveUrl,
      v.deliveryProvider ?? prepared?.deliveryProvider
    );
    const previewUrlRaw = String(v.previewUrl ?? prepared?.previewUrl ?? '').trim();
    const previewUrl =
      previewUrlRaw && !isGoogleDriveLink(previewUrlRaw) && !/\.gif(\?.*)?$/i.test(previewUrlRaw)
        ? previewUrlRaw
        : undefined;
    const renditions = v.renditions ?? prepared?.renditions ?? undefined;

    const entry = {
      slug: candidateSlug,
      title: String(v.title || titleFromSlug(candidateSlug)).trim(),
      status: normalizeStatus(v.status, v.draft),
      featured: Boolean(v.featured ?? false),
      order: typeof v.order === 'number' && !Number.isNaN(v.order) ? v.order : (i + 1) * 10,
      collectionOrder: v.collectionOrder && typeof v.collectionOrder === 'object' ? v.collectionOrder : undefined,
      collections: refs,
      orientation,
      masterSource: masterSource || undefined,
      playbackUrl: rawPlaybackUrl || undefined,
      url: effectiveUrl,
      webmUrl: v.webmUrl ? String(v.webmUrl).trim() : undefined,
      previewUrl,
      captionsUrl: v.captionsUrl ? String(v.captionsUrl).trim() : undefined,
      deliveryProvider: deliveryProvider !== 'none' ? deliveryProvider : undefined,
      renditions,
      year: v.year ? String(v.year).trim() : undefined,
      duration: v.duration ? String(v.duration).trim() : undefined,
      role: v.role ? String(v.role).trim() : undefined,
      client: v.client ? String(v.client).trim() : undefined,
      description: v.description ? String(v.description).trim() : undefined,
      localFileHint: v.localFileHint,
      poster: {
        src: thumb.src,
        alt: v.poster?.alt || String(v.title || titleFromSlug(candidateSlug)).trim(),
        existsOnDisk: thumb.exists,
        suggested: thumb.suggested,
        youtubeThumbSuggestion: ytId ? `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg` : undefined,
      },
    };

    videoBySlug.set(candidateSlug, entry);
    if (dedupeKeyUrl) slugBySource.set(dedupeKeyUrl, candidateSlug);
  }

  return {
    collections: [...collectionMap.values()],
    videos: [...videoBySlug.values()],
    mergedDuplicates,
    driveSourceWarnings,
  };
}

function renderCollectionMarkdown(c) {
  const lines = [
    '---',
    `title: ${JSON.stringify(c.title)}`,
    `kind: ${JSON.stringify(c.kind)}`,
    `status: ${JSON.stringify(c.status)}`,
    `demo: false`,
    `featured: ${c.featured}`,
    `order: ${c.order}`,
  ];
  if (c.tagline) lines.push(`tagline: ${JSON.stringify(c.tagline)}`);
  if (c.year) lines.push(`year: ${JSON.stringify(c.year)}`);
  if (c.client) lines.push(`client: ${JSON.stringify(c.client)}`);
  if (c.url) lines.push(`url: ${JSON.stringify(c.url)}`);
  if (c.heroVideo) lines.push(`heroVideo: ${JSON.stringify(c.heroVideo)}`);
  lines.push('cover:');
  lines.push(`  src: ${JSON.stringify(c.cover.src)}`);
  lines.push(`  alt: ${JSON.stringify(c.cover.alt || c.title)}`);
  lines.push('---', '');
  return lines.join('\n');
}

function renderVideoMarkdown(v) {
  const lines = [
    '---',
    `title: ${JSON.stringify(v.title)}`,
    `status: ${JSON.stringify(v.status)}`,
    `demo: false`,
    `featured: ${v.featured}`,
    `order: ${v.order}`,
  ];
  if (v.collectionOrder && Object.keys(v.collectionOrder).length > 0) {
    lines.push('collectionOrder:');
    for (const [k, ord] of Object.entries(v.collectionOrder)) {
      lines.push(`  ${JSON.stringify(k)}: ${Number(ord)}`);
    }
  }
  lines.push(`collections: ${JSON.stringify(v.collections)}`);
  lines.push(`orientation: ${JSON.stringify(v.orientation)}`);
  if (v.masterSource) lines.push(`masterSource: ${JSON.stringify(v.masterSource)}`);
  if (v.playbackUrl) lines.push(`playbackUrl: ${JSON.stringify(v.playbackUrl)}`);
  if (v.url) lines.push(`url: ${JSON.stringify(v.url)}`);
  if (v.webmUrl) lines.push(`webmUrl: ${JSON.stringify(v.webmUrl)}`);
  if (v.previewUrl) lines.push(`previewUrl: ${JSON.stringify(v.previewUrl)}`);
  if (v.captionsUrl) lines.push(`captionsUrl: ${JSON.stringify(v.captionsUrl)}`);
  if (v.deliveryProvider) lines.push(`deliveryProvider: ${JSON.stringify(v.deliveryProvider)}`);
  if (v.renditions && Object.keys(v.renditions).length > 0) {
    lines.push(`renditions: ${JSON.stringify(v.renditions)}`);
  }
  if (v.year) lines.push(`year: ${JSON.stringify(v.year)}`);
  if (v.duration) lines.push(`duration: ${JSON.stringify(v.duration)}`);
  if (v.role) lines.push(`role: ${JSON.stringify(v.role)}`);
  if (v.client) lines.push(`client: ${JSON.stringify(v.client)}`);
  if (v.description) lines.push(`description: ${JSON.stringify(v.description)}`);
  lines.push('poster:');
  lines.push(`  src: ${JSON.stringify(v.poster.src)}`);
  lines.push(`  alt: ${JSON.stringify(v.poster.alt || v.title)}`);
  lines.push('---', '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { from: null, scan: null, out: null, mediaManifest: DEFAULT_MEDIA_MANIFEST, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) args.from = argv[++i];
    else if (a === '--scan' && argv[i + 1]) args.scan = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--media-manifest' && argv[i + 1]) args.mediaManifest = resolve(argv[++i]);
    else if (a === '--write') args.write = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from && !args.scan) {
    console.log(`Usage:
  pnpm content:intake --from <manifest.json | manifest.csv | links.txt> [--media-manifest media-workspace/media-manifest.json] [--write] [--out normalized.json]
  pnpm content:intake --scan <organized-folder> [--out draft-manifest.json] [--write]`);
    process.exit(0);
  }

  let raw;
  if (args.scan) {
    raw = scanOrganizedDirectory(args.scan);
  } else {
    const filePath = resolve(args.from);
    if (!existsSync(filePath)) {
      console.error(`Error: Intake file not found at ${filePath}`);
      process.exit(1);
    }
    const ext = extname(filePath).toLowerCase();
    const content = readFileSync(filePath, 'utf8');
    if (ext === '.json') raw = JSON.parse(content);
    else if (ext === '.csv') raw = parseCsvManifest(content);
    else raw = parseLinksTxt(content);
  }

  let mediaManifestItems = {};
  if (args.mediaManifest && existsSync(args.mediaManifest)) {
    try {
      const mm = JSON.parse(readFileSync(args.mediaManifest, 'utf8'));
      mediaManifestItems = mm.items ?? {};
    } catch {
      // ignore invalid media manifest
    }
  }

  const normalized = normalizeManifest(raw, mediaManifestItems);
  const { collections, videos, mergedDuplicates, driveSourceWarnings } = normalized;

  console.log('\n=== Batch Content Intake Summary (Round 03.1) ===');
  console.log(`Collections : ${collections.length} (series: ${collections.filter((c) => c.kind === 'series').length}, channel: ${collections.filter((c) => c.kind === 'channel').length}, brand: ${collections.filter((c) => c.kind === 'brand').length})`);
  console.log(`Videos      : ${videos.length} (16:9 landscape: ${videos.filter((v) => v.orientation === 'landscape').length}, 9:16 portrait: ${videos.filter((v) => v.orientation === 'portrait').length}, standalone: ${videos.filter((v) => v.collections.length === 0).length})`);

  if (driveSourceWarnings.length > 0) {
    console.log(`\nGoogle Drive URLs moved to masterSource (never used as direct HTML5 <video> public URL):`);
    for (const w of driveSourceWarnings) {
      console.log(`  ⚠ ${w.slug}: moved ${w.field} (${w.movedUrl}) -> masterSource.driveUrl`);
    }
  }

  if (mergedDuplicates.length > 0) {
    console.log(`\nDeduplicated multi-collection videos (${mergedDuplicates.length}):`);
    for (const d of mergedDuplicates) {
      console.log(`  • ${d.slug} (defined once, linked to multiple collections)`);
    }
  }

  const missingCovers = collections.filter((c) => !c.cover.existsOnDisk);
  const missingPosters = videos.filter((v) => !v.poster.existsOnDisk);
  const missingUrls = videos.filter((v) => !v.url && !v.playbackUrl);

  if (missingCovers.length > 0 || missingPosters.length > 0) {
    console.log('\nThumbnail / Cover Suggestions (place images at these paths or run `pnpm media:encode --preset poster`):');
    for (const c of missingCovers) {
      console.log(`  [Cover 16:10]  public${c.cover.src}  (for collection "${c.title}")`);
    }
    for (const v of missingPosters) {
      const ratio = v.orientation === 'portrait' ? '9:16 (900×1600)' : '16:9 (1600×900)';
      const ytHint = v.poster.youtubeThumbSuggestion ? ` | YouTube frame ref: ${v.poster.youtubeThumbSuggestion}` : '';
      console.log(`  [Poster ${ratio}] public${v.poster.src}${ytHint}`);
    }
  }

  if (missingUrls.length > 0) {
    console.log(`\nVideos without playable delivery URL yet (${missingUrls.length}) — will render clean poster without fake play button:`);
    for (const v of missingUrls) {
      console.log(`  • ${v.slug} (${v.title})`);
    }
  }

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          collections: collections.map(({ cover, ...rest }) => ({
            ...rest,
            thumbnail: cover.src,
          })),
          videos: videos.map(({ poster, localFileHint, ...rest }) => ({
            ...rest,
            poster: poster.src,
            thumbnail: poster.src,
          })),
        },
        null,
        2
      ) + '\n'
    );
    console.log(`\nSaved normalized manifest to: ${outPath}`);
  }

  if (args.write) {
    mkdirSync(COLLECTIONS_DIR, { recursive: true });
    mkdirSync(VIDEOS_DIR, { recursive: true });

    for (const c of collections) {
      writeFileSync(join(COLLECTIONS_DIR, `${c.slug}.md`), renderCollectionMarkdown(c));
    }
    for (const v of videos) {
      writeFileSync(join(VIDEOS_DIR, `${v.slug}.md`), renderVideoMarkdown(v));
    }
    console.log(`\nWrote ${collections.length} collection(s) to src/content/collections/ and ${videos.length} video(s) to src/content/videos/.`);
  } else {
    console.log('\nDry-run complete (no content files modified). Pass --write to generate markdown entries.');
  }
}

main();
