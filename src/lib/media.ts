/**
 * Media source resolution — turns a video's `playbackUrl` / `url` / `renditions` into a safe player descriptor.
 * Pure functions, safe to import from both server (Astro) and client scripts.
 *
 * Round 03.1 guardrails:
 *  - Google Drive direct download / share URLs (`drive.google.com`, `docs.googleusercontent.com`, `gdrive://`)
 *    are NEVER used as native HTML5 `<video>` sources (rate-limited, lacks reliable Range/CORS, breaks on Safari/iOS).
 *  - Animated `.gif` files are rejected as video/preview sources.
 *  - Supports Cloudflare R2 versioned MP4s, multi-rendition fallbacks (`web-high-quality` + `web-standard`),
 *    YouTube (including Shorts), and Vimeo (including unlisted hash links).
 */

export type DeliveryProvider = 'r2' | 'pages' | 'youtube' | 'vimeo' | 'external' | 'none';

export type PlayableSource =
  | {
    type: 'file';
    src: string;
    webm?: string;
    /** Optional secondary MP4 source (e.g. `web-standard` fallback behind `web-high-quality`). */
    fallbackSrc?: string;
    provider: DeliveryProvider;
  }
  | { type: 'youtube'; id: string; embed: string; provider: 'youtube' }
  | { type: 'vimeo'; id: string; embed: string; provider: 'vimeo' }
  | { type: 'external'; href: string; host: string; provider: 'external' }
  | { type: 'none'; provider: 'none' };

const FILE_RE = /\.(mp4|m4v|webm|mov)(\?.*)?$/i;
const GIF_RE = /\.gif(\?.*)?$/i;
const YT_ID_RE = /^[a-zA-Z0-9_-]{6,20}$/;

/**
 * Returns true if the URL points to Google Drive or Google Docs content servers.
 * Google Drive links belong in the Source layer (`masterSource`), never as public HTML5 `<video>` streams.
 */
export function isGoogleDriveUrl(url?: string): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (/^gdrive:\/\//i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed, 'https://local.invalid');
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === ' drive.usercontent.google.com'.trim()
    );
  } catch {
    return false;
  }
}

/** Returns true if a URL is an animated GIF (disallowed by Round 03.1 preview strategy). */
export function isAnimatedGifUrl(url?: string): boolean {
  return Boolean(url && GIF_RE.test(url.trim()));
}

export interface ResolveSourceOptions {
  webm?: string;
  fallbackSrc?: string;
  deliveryProvider?: DeliveryProvider;
}

export function resolveSource(
  url?: string,
  webmOrOptions?: string | ResolveSourceOptions
): PlayableSource {
  const opts: ResolveSourceOptions =
    typeof webmOrOptions === 'string' ? { webm: webmOrOptions } : (webmOrOptions ?? {});

  const trimmed = url?.trim();
  if (!trimmed || isAnimatedGifUrl(trimmed)) return { type: 'none', provider: 'none' };

  // Never allow internal gdrive:// URIs or Google Drive direct download links to become HTML5 <video> sources
  if (/^gdrive:\/\//i.test(trimmed)) {
    return { type: 'none', provider: 'none' };
  }
  if (isGoogleDriveUrl(trimmed)) {
    return { type: 'external', href: trimmed, host: 'drive.google.com', provider: 'external' };
  }

  if (FILE_RE.test(trimmed)) {
    const provider: DeliveryProvider =
      opts.deliveryProvider && opts.deliveryProvider !== 'none'
        ? opts.deliveryProvider
        : trimmed.startsWith('/')
          ? 'pages'
          : 'r2';
    const fallback =
      opts.fallbackSrc?.trim() && opts.fallbackSrc.trim() !== trimmed && !isGoogleDriveUrl(opts.fallbackSrc)
        ? opts.fallbackSrc.trim()
        : undefined;
    return {
      type: 'file',
      src: trimmed,
      webm: opts.webm?.trim() || undefined,
      fallbackSrc: fallback,
      provider,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'https://local.invalid');
  } catch {
    return { type: 'none', provider: 'none' };
  }
  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const id =
      host === 'youtu.be'
        ? (segments[0] ?? '')
        : (parsed.searchParams.get('v') ?? segments.pop() ?? '');
    if (id && YT_ID_RE.test(id)) {
      return {
        type: 'youtube',
        id,
        embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`,
        provider: 'youtube',
      };
    }
  }

  if (host.endsWith('vimeo.com')) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const idIndex = segments.findIndex((s) => /^\d+$/.test(s));
    if (idIndex !== -1) {
      const id = segments[idIndex];
      // Support unlisted Vimeo links (`vimeo.com/<id>/<hash>` or `?h=<hash>`)
      const nextSegment = segments[idIndex + 1];
      const hashParam =
        parsed.searchParams.get('h') ??
        (nextSegment && /^[a-f0-9]{6,32}$/i.test(nextSegment) ? nextSegment : undefined);
      const query = new URLSearchParams({
        autoplay: '1',
        dnt: '1',
        title: '0',
        byline: '0',
      });
      if (hashParam) query.set('h', hashParam);
      return {
        type: 'vimeo',
        id,
        embed: `https://player.vimeo.com/video/${id}?${query.toString()}`,
        provider: 'vimeo',
      };
    }
  }

  if (host === 'local.invalid') return { type: 'none', provider: 'none' };
  return { type: 'external', href: trimmed, host, provider: 'external' };
}

/**
 * Extracts a rendition URL by preset name from either a map (`renditions['web-standard']`)
 * or an array (`[{ preset: 'web-standard', url: '...' }]`).
 */
export function getRenditionUrl(renditions: unknown, presetKeys: string[]): string | undefined {
  if (!renditions || typeof renditions !== 'object') return undefined;
  if (Array.isArray(renditions)) {
    for (const key of presetKeys) {
      const found = renditions.find((r) => r && typeof r === 'object' && r.preset === key && typeof r.url === 'string');
      if (found?.url) return found.url;
    }
    return undefined;
  }
  const map = renditions as Record<string, { url?: string } | undefined>;
  for (const key of presetKeys) {
    const url = map[key]?.url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return undefined;
}

/**
 * Resolves the best playable source from a video content item's frontmatter,
 * honoring `playbackUrl`, `renditions`, and legacy `url` while blocking Google Drive direct video streaming.
 */
export function resolveVideoPlayback(data: {
  playbackUrl?: string;
  url?: string;
  webmUrl?: string;
  deliveryProvider?: DeliveryProvider;
  renditions?: unknown;
}): PlayableSource {
  const hqUrl = getRenditionUrl(data.renditions, ['web-high-quality', 'webHighQuality']);
  const stdUrl = getRenditionUrl(data.renditions, ['web-standard', 'webStandard']);
  const primaryUrl = data.playbackUrl?.trim() || hqUrl || stdUrl || data.url?.trim();
  const fallbackSrc = primaryUrl === hqUrl && stdUrl ? stdUrl : undefined;

  return resolveSource(primaryUrl, {
    webm: data.webmUrl,
    fallbackSrc,
    deliveryProvider: data.deliveryProvider,
  });
}

/**
 * Resolves a safe short muted preview URL (`hover-preview` or `hero-ambient`),
 * ensuring it is never a Google Drive link or animated GIF.
 */
export function resolvePreviewUrl(data: {
  previewUrl?: string;
  renditions?: unknown;
}): string | undefined {
  const candidate =
    data.previewUrl?.trim() ||
    getRenditionUrl(data.renditions, ['hover-preview', 'hoverPreview', 'hero-ambient', 'heroAmbient']);
  if (!candidate || isGoogleDriveUrl(candidate) || isAnimatedGifUrl(candidate)) {
    return undefined;
  }
  return candidate;
}

export function hostLabel(host: string): string {
  const map: Record<string, string> = {
    'tiktok.com': 'TikTok',
    'instagram.com': 'Instagram',
    'facebook.com': 'Facebook',
    'fb.watch': 'Facebook',
    'behance.net': 'Behance',
    'frame.io': 'Frame.io',
    'drive.google.com': 'Google Drive',
    'docs.google.com': 'Google Drive',
    'dropbox.com': 'Dropbox',
  };
  return map[host] ?? host;
}
