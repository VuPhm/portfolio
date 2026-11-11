import type { ScrollStoryConfig } from '../lib/scroll-story';

export interface SocialLink {
  label: string;
  url: string;
}

export interface StatItem {
  value: string;
  label: string;
  /** Optional context note (e.g. "DEMO" when testing mock/sample metrics — never publish fake claims). */
  note?: string;
}

export interface SkillCategory {
  id: string;
  name: string;
  label: string;
  description?: string;
}

export interface IdentityConfig {
  name: string;
  displayName: string;
  role: string;
  title: string;
  brand: string;
  location?: string;
}

export interface IntroductionConfig {
  headline: string;
  lead: string;
  body: string;
}

export interface ExperienceConfig {
  headline: string;
  fields: string[];
}

export interface SkillsConfig {
  headline: string;
  categories: SkillCategory[];
  tools: string[];
}

export interface ContactDataConfig {
  email: string;
  headline: string;
  subline: string;
  primaryCtaLabel: string;
  driveFolderUrl: string;
  driveLabel: string;
  socials: SocialLink[];
}

export interface LocalizationConfig {
  locale: string;
  lang: string;
  siteTitle: string;
  description: string;
}

const PLACEHOLDER_EMAIL_RE = /(@example\.(com|org|net)$|\[|\]|^your-|^test@)/i;

/** Returns true only when `email` is a real, non-placeholder address. */
export function hasRealContactEmail(email?: string): email is string {
  if (!email || !email.includes('@')) return false;
  return !PLACEHOLDER_EMAIL_RE.test(email.trim());
}

/** Returns true when a social link points to a specific profile rather than a generic platform homepage. */
export function isRealSocialLink(link: SocialLink): boolean {
  try {
    const u = new URL(link.url);
    const path = u.pathname.replace(/\/+$/, '');
    return path.length > 0 && !/\[|\]|your-handle/i.test(path);
  } catch {
    return false;
  }
}

const envDemoPreview = Boolean(
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.PUBLIC_DEMO_PREVIEW === 'true'
);

/* ------------------------------------------------------------------ */
/* Structured personal identity groups (Round 03.5)                   */
/* ------------------------------------------------------------------ */

export const identity: IdentityConfig = {
  name: 'VUPHM',
  displayName: 'VUPHM',
  role: 'Video Editor',
  title: 'Video Editor',
  brand: 'VUPHM',
};

export const introduction: IntroductionConfig = {
  headline: 'Giới thiệu',
  lead: 'VUPHM — Video Editor.',
  body: 'Biên tập video, chỉnh màu và hoàn thiện âm thanh cho định dạng 16:9 và 9:16.',
};

export const experience: ExperienceConfig = {
  headline: 'Lĩnh vực thực hiện',
  fields: [
    'Video ngắn 9:16 (Shorts / Reels / TikTok)',
    'Video thương mại & quảng bá',
    'Recap & sự kiện',
  ],
};

export const skills: SkillsConfig = {
  headline: 'Kỹ năng chuyên môn',
  categories: [
    { id: 'editing', name: 'Video Editing', label: 'Biên tập & cắt dựng' },
    { id: 'color', name: 'Color Grading', label: 'Chỉnh màu' },
    { id: 'sound', name: 'Sound Post', label: 'Hậu kỳ âm thanh' },
  ],
  /**
   * Software & Tools Integrity Policy (Round 03.5 / Session 03):
   * Link Google Sites (/edit) yêu cầu đăng nhập tài khoản riêng tư (302 Redirect).
   * Không tự suy đoán hoặc gán Premiere Pro, After Effects, DaVinci Resolve hay Photoshop khi chưa xác thực từ tài liệu công khai.
   * Danh sách tools được giữ rỗng để tự động ẩn khỏi giao diện sản xuất cho đến khi có dữ liệu nguồn đối chiếu chính thức.
   */
  tools: [],
};

export const socialLinks: SocialLink[] = [];

export const contactData: ContactDataConfig = {
  email: 'contact@vuphm.io.vn',
  headline: 'Liên hệ',
  subline: 'Trao đổi về dự án hoặc công việc biên tập video.',
  primaryCtaLabel: 'Gửi email',
  driveFolderUrl: 'https://drive.google.com/drive/folders/1aDD-kdQj_pUjHSYqqPHcvp8oVO68LnKK?usp=drive_link',
  driveLabel: 'Mở thư mục sản phẩm trên Google Drive',
  socials: socialLinks,
};

export const localization: LocalizationConfig = {
  locale: 'vi',
  lang: 'vi',
  siteTitle: 'VUPHM — Video Editor',
  description: 'Portfolio biên tập video của VUPHM — Loạt video, kênh và thương hiệu.',
};

/**
 * Personality & content tokens — Round 03.5 (Personal Identity & Portfolio Content Integration)
 *
 * Tên hiển thị: VUPHM
 * Chức danh: Video Editor
 * Email: contact@vuphm.io.vn
 *
 * Nguyên tắc biên tập:
 * - Thông tin trực tiếp, ngắn gọn, chuyên nghiệp.
 * - Không slogan ("Every frame. With intent." đã bị loại bỏ), không triết lý.
 * - Không tự nhận thành tích, đối tác, số liệu khi chưa xác minh.
 * - Toàn bộ số liệu thống kê tắt theo quy tắc: Chưa có dữ liệu xác thực thì không đề cập.
 * - Không hiển thị placeholder, link rác hay tiến độ phần trăm kỹ năng.
 */
export const siteConfig = {
  name: identity.name,
  role: identity.role,
  siteTitle: localization.siteTitle,
  description: localization.description,
  url: 'https://vuphm.io.vn',

  /** Production integrity mode (`demoPreview: false` by default). */
  demoPreview: envDemoPreview,

  identity,
  introduction,
  experience,
  skills,
  tools: skills.tools,
  socialLinks,
  contact: contactData,
  localization,

  personality: {
    hero: {
      videoSlug: 'kinetic-silence',
      headline: identity.name,
      headlineAccent: identity.role,
      subline: 'Biên tập video & hậu kỳ hình ảnh.',
    },

    collections: {
      eyebrow: 'Tác phẩm',
      headline: 'Bộ sưu tập',
      subline: 'Loạt video, kênh và thương hiệu.',
      taglines: {} as Record<string, string>,
      showTaglineOnStandardCards: false,
    },

    selectedVideos: {
      eyebrow: 'Tuyển chọn',
      headline: 'Video nổi bật',
      subline: 'Các tác phẩm hoàn thiện theo định dạng 16:9 và 9:16.',
      landscapeHeading: 'Video 16:9',
      portraitHeading: 'Video 9:16',
    },

    emptyState: {
      eyebrow: '',
      headline: 'Nội dung đang chuẩn bị.',
      subline: 'Các tác phẩm đang được cập nhật.',
      collectionHeadline: 'Nội dung đang chuẩn bị.',
      collectionSubline: 'Video trong bộ sưu tập đang được cập nhật.',
      actionLabel: 'Liên hệ',
    },

    cta: {
      heroFeaturedPrefix: 'Xem',
      heroPrimaryLabel: 'Xem tác phẩm',
      heroSecondaryLabel: 'Liên hệ',
      viewAllCollections: 'Tất cả tác phẩm',
      collectionContextPrompt: 'Trao đổi về dự án hoặc công việc dựng video?',
      collectionContextAction: 'Liên hệ',
      videoContextPrompt: 'Trao đổi về dự án hoặc công việc dựng video?',
      videoContextAction: 'Liên hệ',
    },

    statistics: {
      /**
       * Quy tắc Round 03.3/03.5: Chưa có dữ liệu xác thực thì không đề cập.
       * Tắt toàn bộ thống kê (số video, dự án, khách hàng, kinh nghiệm, thành tích).
       */
      enabled: false,
      minItems: 2,
      autoFromContent: false,
      showDemoCountsInPreview: false,
      verifiedMetrics: [] as StatItem[],
    },

    contact: {
      eyebrow: 'Liên hệ',
      headline: contactData.headline,
      subline: contactData.subline,
      primaryCtaLabel: contactData.primaryCtaLabel,
      placeholderNote: `Liên hệ trực tiếp qua ${contactData.email}.`,
    },
  },

  /** Backwards-compatible aliases used across layouts & pages. */
  get hero() {
    return this.personality.hero;
  },

  about: {
    lead: introduction.lead,
    body: introduction.body,
  },

  /**
   * Scroll story section: tắt khi chưa có cảnh quay thật.
   */
  scrollStory: {
    enabled: false,
    mode: 'sticky-stage',
    lengthVh: 300,
    poster: { src: '/media/posters/campaign-film.svg', alt: 'Poster' },
    chapters: [],
  } satisfies ScrollStoryConfig as ScrollStoryConfig,
};
