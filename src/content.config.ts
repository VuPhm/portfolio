import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Content model — Round 03.1 (Media Optimization & Cloudflare Delivery)
 *
 *  Collection (series | channel | brand)  1 ── n  Video
 *  A video can belong to zero (standalone), one, or many collections, defined only once.
 *
 * Three-layer media separation (Round 03.1):
 *  1. Source (`masterSource`)    : Google Drive or local master archive (read-only, never exposed as HTML5 <video>)
 *  2. Optimized (`renditions`)   : Poster WebP, short muted hover/ambient preview, full web MP4
 *  3. Delivery (`playbackUrl`, `previewUrl`, `deliveryProvider`):
 *     - Cloudflare Pages : website, posters (`/media/posters/*.webp`), lightweight static assets
 *     - Cloudflare R2    : compressed MP4 videos (`hover-preview`, `hero-ambient`, `web-standard`, `web-high-quality`)
 *     - YouTube / Vimeo  : privacy-friendly external embed facade when appropriate
 *
 * Fully backwards-compatible with Round 03 manifests and markdown entries.
 */

const status = z.enum(['published', 'draft']).default('published');
/** Distinguishes sample/demo entries from real portfolio work for honest metrics & badges. */
const demo = z.boolean().default(false);

const mediaObject = z.object({
  src: z.string(),
  alt: z.string().default(''),
  width: z.number().optional(),
  height: z.number().optional(),
  sizeBytes: z.number().optional(),
});

/** Accepts `{ src, alt, ... }` or a direct path string `"/media/posters/slug.webp"`. */
const media = z.preprocess(
  (val) => (typeof val === 'string' ? { src: val, alt: '' } : val),
  mediaObject
);

/** Normalizes orientation shorthands (`16:9`, `9:16`, `horizontal`, `vertical`) to `landscape` | `portrait`. */
const orientationSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const v = val.trim().toLowerCase();
    if (v === '16:9' || v === 'horizontal' || v === 'widescreen' || v === 'landscape') return 'landscape';
    if (v === '9:16' || v === 'vertical' || v === 'short' || v === 'shorts' || v === 'portrait') return 'portrait';
  }
  return val;
}, z.enum(['landscape', 'portrait']).default('landscape'));

/** Normalizes `campaign` alias to `brand` (Brand / Campaign). */
const kindSchema = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim().toLowerCase() === 'campaign') return 'brand';
  return val;
}, z.enum(['series', 'channel', 'brand']));

/** Delivery provider layer (Round 03.1). */
const deliveryProviderSchema = z
  .enum(['r2', 'pages', 'youtube', 'vimeo', 'external', 'none'])
  .optional();

/**
 * Master source descriptor (Google Drive file/folder reference or local archive path).
 * Accepts either a plain string (`"gdrive://..."`, `"/Volumes/Archive/master.mov"`) or a metadata object.
 */
const masterSourceObject = z.object({
  location: z.string().optional(),
  localPath: z.string().optional(),
  driveFileId: z.string().optional(),
  driveUrl: z.string().optional(),
  fileName: z.string().optional(),
  codec: z.string().optional(),
  pixFmt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  sizeBytes: z.number().optional(),
  hash8: z.string().optional(),
  hdr: z.union([z.boolean(), z.string()]).optional(),
  notes: z.string().optional(),
});

const masterSourceSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? { location: val.trim() } : val),
    masterSourceObject
  )
  .optional();

/** Individual encoded rendition metadata (all fields optional so partial encodes are always valid). */
const renditionItemSchema = z.object({
  preset: z.string().optional(),
  url: z.string().optional(),
  publicPath: z.string().optional(),
  localPath: z.string().optional(),
  objectKey: z.string().optional(),
  deliveryProvider: z.string().optional(),
  mimeType: z.string().optional(),
  cacheControl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  durationSec: z.number().optional(),
  sizeBytes: z.number().optional(),
  bitrateKbps: z.number().optional(),
  crf: z.number().optional(),
  faststart: z.boolean().optional(),
  hash8: z.string().optional(),
});

const renditionsSchema = z
  .union([z.record(z.string(), renditionItemSchema), z.array(renditionItemSchema)])
  .optional();

/** Normalizes shorthand aliases (`thumbnail` → `cover`/`poster`, `source` → `url`, `draft` → `status`). */
function normalizeEntryAliases(raw: unknown, mediaField: 'cover' | 'poster'): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  if (obj[mediaField] === undefined && obj.thumbnail !== undefined) {
    obj[mediaField] = obj.thumbnail;
  }
  if (obj.url === undefined && typeof obj.source === 'string' && obj.source.trim().length > 0) {
    obj.url = obj.source.trim();
  }
  if (obj.url === undefined && typeof obj.playbackUrl === 'string' && obj.playbackUrl.trim().length > 0) {
    obj.url = obj.playbackUrl.trim();
  }
  if (obj.status === undefined && typeof obj.draft === 'boolean') {
    obj.status = obj.draft ? 'draft' : 'published';
  }
  if (typeof obj.collections === 'string') {
    obj.collections = obj.collections
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return obj;
}

const collectionsCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/collections' }),
  schema: z.preprocess(
    (raw) => normalizeEntryAliases(raw, 'cover'),
    z.object({
      title: z.string(),
      kind: kindSchema,
      status,
      demo,
      featured: z.boolean().default(false),
      order: z.number().default(100),
      /** One short line. Optional — the cover should do the talking. */
      tagline: z.string().optional(),
      year: z.string().optional(),
      client: z.string().optional(),
      /** Grid / card image (`{ src, alt }` or string path; `thumbnail` also accepted). */
      cover: media,
      /** Optional wide hero for the collection page. Falls back to `cover`. */
      hero: media.optional(),
      /** Optional ambient loop (muted) for the collection hero. */
      heroVideo: z.string().optional(),
      /** Optional external home of the collection (channel / playlist URL). */
      url: z.url().optional(),
    })
  ),
});

const videosCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/videos' }),
  schema: z.preprocess(
    (raw) => normalizeEntryAliases(raw, 'poster'),
    z.object({
      title: z.string(),
      status,
      demo,
      featured: z.boolean().default(false),
      order: z.number().default(100),
      /**
       * Optional per-collection display order override when a single video belongs to
       * multiple collections (e.g. `{ "seasonal-campaign": 1, "daily-frames": 4 }`).
       */
      collectionOrder: z.record(z.string(), z.number()).optional(),
      /** Zero or more collection slugs. Empty = standalone video. */
      collections: z.array(reference('collections')).default([]),
      orientation: orientationSchema,
      /** Aspect ratio string: '9:16', '16:9', '4:5', etc. */
      aspectRatio: z.string().optional(),
      /** Thumbnail / poster (`{ src, alt }` or string path; `thumbnail` also accepted). */
      poster: media,
      /**
       * Master source archive reference (Google Drive or local master file).
       * Stored for provenance/re-encoding only; never used as a direct HTML5 video source.
       */
      masterSource: masterSourceSchema,
      /**
       * Primary optimized playback URL (e.g. Cloudflare R2 `web-standard` / `web-high-quality` MP4,
       * or YouTube/Vimeo URL). Takes precedence over legacy `url` / `source` when present.
       */
      playbackUrl: z.string().optional(),
      /**
       * Legacy / general video URL (`url` or `source` alias). Supported:
       *  - Cloudflare R2 or local file: `https://media.example.com/.../web-standard.v1.mp4` → native player
       *  - YouTube / Vimeo URL (including Shorts & unlisted Vimeo hashes) → privacy-friendly embed, loaded only on open
       *  - any other URL (including Google Drive share links) → "Watch on …" external link (never direct HTML5 video)
       * Leave empty while the video is not ready — the poster is shown, no play button.
       */
      url: z.string().optional(),
      /** Optional extra source for native playback (e.g. a `.webm` next to the `.mp4`). */
      webmUrl: z.string().optional(),
      /** Short muted loop (3–8s) used for hover preview / ambient hero. */
      previewUrl: z.string().optional(),
      captionsUrl: z.string().optional(),
      /** Delivery layer provider (`r2` | `pages` | `youtube` | `vimeo` | `external` | `none`). */
      deliveryProvider: deliveryProviderSchema,
      /** Optional map or list of available encoded renditions (`poster`, `hover-preview`, `web-standard`, etc.). */
      renditions: renditionsSchema,
      year: z.string().optional(),
      duration: z.string().optional(),
      role: z.string().optional(),
      client: z.string().optional(),
      /** One or two sentences, optional. */
      description: z.string().optional(),
    })
  ),
});

export const collections = {
  collections: collectionsCollection,
  videos: videosCollection,
};
