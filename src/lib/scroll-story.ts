/**
 * Scroll-motion foundation (future "product page" style section).
 *
 * Round 02 only ships the architecture: a typed config, a sticky stage component
 * (`src/components/ScrollStory.astro`) and a tiny progress driver that exposes
 * `--progress` (0 → 1) to CSS. Heavy frame-sequence rendering is intentionally NOT
 * implemented yet; the `frames` mode falls back to the poster until it is.
 */

export interface ScrollStoryChapter {
  /** Visible while progress is within [from, to). Values 0 → 1. */
  from: number;
  to: number;
  title: string;
  body?: string;
}

interface ScrollStoryBase {
  enabled: boolean;
  /** Scroll distance of the section, in viewport heights. 200–500 is typical. */
  lengthVh: number;
  poster: { src: string; alt: string };
  chapters: ScrollStoryChapter[];
}

/** Sticky full-bleed stage, CSS-only motion driven by `--progress`. */
export interface StickyStageStory extends ScrollStoryBase {
  mode: 'sticky-stage';
}

/**
 * Scroll-scrubbed video. Encode the file with a short GOP / all-intra keyframes
 * (e.g. `ffmpeg -g 1`) or seeking will stutter.
 */
export interface ScrubVideoStory extends ScrollStoryBase {
  mode: 'scrub-video';
  video: { src: string; webm?: string };
}

/**
 * Canvas image sequence — reserved. Only reach for this when scrubbed video
 * is not smooth enough. Frames: `pattern` with `{i}` replaced by a zero-padded index.
 */
export interface FrameSequenceStory extends ScrollStoryBase {
  mode: 'frames';
  frames: { pattern: string; count: number; width: number; height: number; pad?: number };
}

export type ScrollStoryConfig = StickyStageStory | ScrubVideoStory | FrameSequenceStory;

