import { resolveVideoPlayback, type PlayableSource } from './media';
import type { VideoItem } from './content';

/** Serializable description of a video, consumed by the lightbox player script. */
export interface PlayerPayload {
  slug: string;
  title: string;
  href: string;
  poster: string;
  alt: string;
  orientation: 'landscape' | 'portrait';
  aspectRatio?: string;
  source: PlayableSource;
  captions?: string;
  meta: string;
}

export function playerPayload(video: VideoItem, collectionTitles: Map<string, string>): PlayerPayload {
  const d = video.data;
  const names = d.collections.map((c) => collectionTitles.get(c.id)).filter(Boolean) as string[];
  return {
    slug: video.id,
    title: d.title,
    href: `/videos/${video.id}`,
    poster: d.poster.src,
    alt: d.poster.alt || d.title,
    orientation: d.orientation,
    aspectRatio: d.aspectRatio,
    source: resolveVideoPlayback(d),
    captions: d.captionsUrl,
    meta: [...names, d.year, d.duration].filter(Boolean).join(' · '),
  };
}
