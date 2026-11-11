import { getCollection, type CollectionEntry } from 'astro:content';
import { siteConfig, type StatItem } from '../data/site';

export type CollectionItem = CollectionEntry<'collections'>;
export type VideoItem = CollectionEntry<'videos'>;
export type CollectionKind = CollectionItem['data']['kind'];

export const KIND_LABEL: Record<CollectionKind, { one: string; many: string }> = {
  series: { one: 'Loạt video', many: 'Loạt video' },
  channel: { one: 'Kênh', many: 'Kênh' },
  brand: { one: 'Thương hiệu', many: 'Thương hiệu' },
};

const byOrder = <T extends { data: { order: number; title: string } }>(a: T, b: T) =>
  a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);

/**
 * Published collections, sorted by `order`.
 * Drafts never reach a public build; `demo: true` entries are included only while `siteConfig.demoPreview` is true.
 */
export async function getCollections(): Promise<CollectionItem[]> {
  const items = await getCollection('collections', ({ data }) => {
    if (data.status !== 'published') return false;
    if (!siteConfig.demoPreview && data.demo) return false;
    return true;
  });
  return items.sort(byOrder);
}

/**
 * Published videos, sorted by `order`.
 * Drafts never reach a public build; `demo: true` entries are included only while `siteConfig.demoPreview` is true.
 */
export async function getVideos(): Promise<VideoItem[]> {
  const items = await getCollection('videos', ({ data }) => {
    if (data.status !== 'published') return false;
    if (!siteConfig.demoPreview && data.demo) return false;
    return true;
  });
  return items.sort(byOrder);
}

/** Strictly non-demo published collections (used by sitemap & production integrity checks). */
export async function getRealCollections(): Promise<CollectionItem[]> {
  const items = await getCollection('collections', ({ data }) => data.status === 'published' && !data.demo);
  return items.sort(byOrder);
}

/** Strictly non-demo published videos (used by sitemap & production integrity checks). */
export async function getRealVideos(): Promise<VideoItem[]> {
  const items = await getCollection('videos', ({ data }) => data.status === 'published' && !data.demo);
  return items.sort(byOrder);
}

export async function getVideoBySlug(slug: string): Promise<VideoItem | undefined> {
  return (await getVideos()).find((v) => v.id === slug);
}

/** slug → kind for every published collection. */
export async function getCollectionKinds(): Promise<Map<string, CollectionKind>> {
  return new Map((await getCollections()).map((c) => [c.id, c.data.kind]));
}

/** Space-separated kinds a video belongs to (`standalone` when it has none) — used by filters. */
export function videoKinds(video: VideoItem, kinds: Map<string, CollectionKind>): string {
  const list = [...new Set(video.data.collections.map((c) => kinds.get(c.id)).filter(Boolean))];
  return list.length ? list.join(' ') : 'standalone';
}

/** slug → title for every published collection. */
export async function getCollectionTitles(): Promise<Map<string, string>> {
  return new Map((await getCollections()).map((c) => [c.id, c.data.title]));
}

export function videoCollectionIds(video: VideoItem): string[] {
  return video.data.collections.map((ref) => ref.id);
}

/**
 * Videos that belong to `collectionId`, sorted by per-collection order (`collectionOrder[collectionId]`)
 * when specified, falling back to `video.data.order` and `title`.
 */
export function videosIn(collectionId: string, videos: VideoItem[]): VideoItem[] {
  return videos
    .filter((v) => videoCollectionIds(v).includes(collectionId))
    .sort((a, b) => {
      const oa = a.data.collectionOrder?.[collectionId] ?? a.data.order;
      const ob = b.data.collectionOrder?.[collectionId] ?? b.data.order;
      return oa - ob || a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);
    });
}

/** Standalone videos (no collection). */
export function standaloneVideos(videos: VideoItem[]): VideoItem[] {
  return videos.filter((v) => v.data.collections.length === 0);
}

/** Homepage "Selected Videos": featured videos that are not used as the hero. */
export function selectedVideos(videos: VideoItem[], excludeSlug?: string): VideoItem[] {
  return videos.filter((v) => v.data.featured && v.id !== excludeSlug);
}

export interface CollectionSummary {
  entry: CollectionItem;
  videos: VideoItem[];
  count: number;
  /** Dominant orientation — used to pick a sensible grid. */
  orientation: 'landscape' | 'portrait' | 'mixed';
}

export function summarize(entry: CollectionItem, allVideos: VideoItem[]): CollectionSummary {
  const videos = videosIn(entry.id, allVideos);
  const portrait = videos.filter((v) => v.data.orientation === 'portrait').length;
  const orientation =
    portrait === 0 ? 'landscape' : portrait === videos.length ? 'portrait' : 'mixed';
  return { entry, videos, count: videos.length, orientation };
}

/** Splits a list of videos into orientation groups, keeping the original order inside each. */
export function groupByOrientation(videos: VideoItem[]) {
  return {
    landscape: videos.filter((v) => v.data.orientation === 'landscape'),
    portrait: videos.filter((v) => v.data.orientation === 'portrait'),
  };
}

export function countLabel(n: number): string {
  return `${n} video`;
}

/** Resolves a collection's tagline from `siteConfig.personality.collections.taglines` or frontmatter. */
export function resolveCollectionTagline(entry: CollectionItem): string | undefined {
  return siteConfig.personality.collections.taglines[entry.id] ?? entry.data.tagline;
}

/**
 * Computes minimal, honest portfolio statistics from published content + optional verified metrics.
 * - Real published entries (`demo: false`) are counted without any demo badge.
 * - Sample entries (`demo: true`) are never presented as real achievements; when `showDemoCountsInPreview`
 *   is enabled during `demoPreview`, sample-derived counts carry `note: 'DEMO'`.
 * - Returns an empty array when disabled or below `minItems` threshold so the UI can cleanly hide.
 */
export function buildSiteStats(collections: CollectionItem[], videos: VideoItem[]): StatItem[] {
  const cfg = siteConfig.personality.statistics;
  if (!cfg.enabled) return [];

  const items: StatItem[] = [];

  if (cfg.autoFromContent) {
    const realVideos = videos.filter((v) => !v.data.demo);
    const realCollections = collections.filter((c) => !c.data.demo);
    const usingDemoSample =
      realVideos.length === 0 &&
      realCollections.length === 0 &&
      siteConfig.demoPreview &&
      cfg.showDemoCountsInPreview;

    const targetVideos = realVideos.length > 0 ? realVideos : usingDemoSample ? videos : [];
    const targetCollections =
      realCollections.length > 0 ? realCollections : usingDemoSample ? collections : [];
    const badge = usingDemoSample ? 'DEMO' : undefined;

    if (targetVideos.length > 0) {
      items.push({
        value: String(targetVideos.length).padStart(2, '0'),
        label: usingDemoSample
          ? 'Sample cuts in preview'
          : targetVideos.length === 1
            ? 'Published cut'
            : 'Published cuts',
        note: badge,
      });
    }
    if (targetCollections.length > 0) {
      items.push({
        value: String(targetCollections.length).padStart(2, '0'),
        label: usingDemoSample ? 'Sample collections' : 'Series, channels & brands',
        note: badge,
      });
    }
    const hasLandscape = targetVideos.some((v) => v.data.orientation === 'landscape');
    const hasPortrait = targetVideos.some((v) => v.data.orientation === 'portrait');
    if (hasLandscape && hasPortrait) {
      items.push({
        value: '16:9 · 9:16',
        label: 'Widescreen & vertical native',
      });
    }
  }

  for (const metric of cfg.verifiedMetrics) {
    if (metric.value && metric.label) {
      if (metric.note === 'DEMO' && !siteConfig.demoPreview) continue;
      items.push(metric);
    }
  }

  return items.length >= cfg.minItems ? items : [];
}

/** Computes minimal statistics for an individual collection detail page. */
export function buildCollectionStats(collection: CollectionItem, videos: VideoItem[]): StatItem[] {
  if (!siteConfig.personality.statistics.enabled || videos.length === 0) return [];

  const isDemo = collection.data.demo || videos.every((v) => v.data.demo);
  if (isDemo && (!siteConfig.demoPreview || !siteConfig.personality.statistics.showDemoCountsInPreview)) {
    return [];
  }

  const { landscape, portrait } = groupByOrientation(videos);
  const formatValue =
    landscape.length > 0 && portrait.length > 0
      ? '16:9 + 9:16'
      : portrait.length > 0
        ? '9:16'
        : '16:9';

  const countLabelByKind: Record<CollectionKind, string> = {
    series: 'Tập',
    channel: 'Video',
    brand: 'Sản phẩm',
  };

  const stats: StatItem[] = [
    {
      value: String(videos.length).padStart(2, '0'),
      label: countLabelByKind[collection.data.kind],
      note: isDemo ? 'DEMO' : undefined,
    },
    {
      value: formatValue,
      label:
        landscape.length > 0 && portrait.length > 0
          ? `${landscape.length} ngang · ${portrait.length} dọc`
          : portrait.length > 0
            ? 'Định dạng dọc'
            : 'Định dạng ngang',
    },
  ];

  if (collection.data.year) {
    stats.push({
      value: collection.data.year,
      label: 'Năm phát hành',
    });
  }

  return stats;
}
