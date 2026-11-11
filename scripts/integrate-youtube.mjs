#!/usr/bin/env node
/**
 * YouTube Portfolio Integration Tool — Round 03.4B
 *
 * Maps YouTube Unlisted URLs into the Astro content collections layer,
 * attaches local WebP posters, creates the "Video ngắn" collection,
 * and maintains strict 3-layer architecture.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const MAPPING_FILE = join(ROOT, 'content-intake', 'youtube-mapping.json');
const VIDEOS_CONTENT_DIR = join(ROOT, 'src', 'content', 'videos');
const COLLECTIONS_CONTENT_DIR = join(ROOT, 'src', 'content', 'collections');

const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (YT_ID_REGEX.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (id && YT_ID_REGEX.test(id)) return id;
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v && YT_ID_REGEX.test(v)) return v;

      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments[0] === 'shorts' || pathSegments[0] === 'embed' || pathSegments[0] === 'v') {
        const id = pathSegments[1];
        if (id && YT_ID_REGEX.test(id)) return id;
      }
    }
  } catch {
    // Not a valid URL
  }

  // Regex fallback
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function syncYouTubeVideos(customMapping = null) {
  const mapping = customMapping || JSON.parse(readFileSync(MAPPING_FILE, 'utf8'));
  mkdirSync(VIDEOS_CONTENT_DIR, { recursive: true });
  mkdirSync(COLLECTIONS_CONTENT_DIR, { recursive: true });

  const published = [];
  const drafts = [];
  const invalid = [];

  let orderIndex = 1;

  for (const item of mapping) {
    const ytId = extractYouTubeId(item.youtubeUrl);

    if (item.youtubeUrl && !ytId) {
      invalid.push({ slug: item.slug, rawUrl: item.youtubeUrl });
    }

    const isPublished = Boolean(ytId);
    const targetStatus = isPublished ? 'published' : 'draft';
    const isFeatured = isPublished && orderIndex === 1;

    const playbackUrl = ytId
      ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
      : '';

    const mdContent = `---
title: ${JSON.stringify(item.title)}
status: ${JSON.stringify(targetStatus)}
demo: false
featured: ${isFeatured}
order: ${isPublished ? orderIndex++ : 100}
collections:
  - "video-ngan"
orientation: "portrait"
aspectRatio: ${JSON.stringify(item.aspectRatio || '9:16')}
duration: ${JSON.stringify(item.duration)}
deliveryProvider: ${isPublished ? '"youtube"' : '"none"'}
playbackUrl: ${JSON.stringify(playbackUrl)}
poster:
  src: ${JSON.stringify(item.posterPath || `/media/posters/${item.slug}.webp`)}
  alt: ${JSON.stringify(item.title)}
masterSource:
  fileName: ${JSON.stringify(item.originalFile || `${item.slug}.mp4`)}
---
`;

    const outPath = join(VIDEOS_CONTENT_DIR, `${item.slug}.md`);
    writeFileSync(outPath, mdContent, 'utf8');

    if (isPublished) {
      published.push({
        slug: item.slug,
        title: item.title,
        ytId,
        playbackUrl,
        aspectRatio: item.aspectRatio,
        duration: item.duration,
      });
    } else {
      drafts.push({
        slug: item.slug,
        title: item.title,
        reason: item.youtubeUrl ? 'Invalid YouTube ID/URL' : 'No YouTube URL provided yet',
      });
    }
  }

  // Ensure collection "video-ngan" exists
  const collectionMd = `---
title: "Video ngắn"
kind: "series"
status: "published"
demo: false
featured: true
order: 1
tagline: "Tuyển tập video ngắn định dạng 9:16 và 4:5."
year: "2026"
cover:
  src: "${published[0] ? `/media/posters/${published[0].slug}.webp` : '/media/posters/c1-opt-2.webp'}"
  alt: "Video ngắn"
---
`;
  writeFileSync(join(COLLECTIONS_CONTENT_DIR, 'video-ngan.md'), collectionMd, 'utf8');

  console.log(`\n=== YOUTUBE INTEGRATION SUMMARY ===`);
  console.log(`Published (Live on site): ${published.length} videos`);
  for (const p of published) {
    console.log(`  ✓ [${p.slug}] ${p.title} (${p.duration}, ${p.aspectRatio}) -> YouTube ID: ${p.ytId}`);
  }
  console.log(`Drafts (Hidden from site): ${drafts.length} videos`);
  for (const d of drafts) {
    console.log(`  - [${d.slug}] ${d.title} (${d.reason})`);
  }
  if (invalid.length > 0) {
    console.warn(`\nWarnings: ${invalid.length} items had invalid URL formats:`, invalid);
  }

  return { published, drafts, invalid };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncYouTubeVideos();
}

