/**
 * Video Taxonomy & JD Keyword Mapping — Round 03.6
 *
 * Multi-dimensional classification system for video editing portfolio:
 * - Categories: 'skill' | 'contentType' | 'industry' | 'platform'
 * - Strict verification: 'verified' (backed by actual video proof) | 'inferred' | 'unidentified'
 * - JD Keyword Mapping: Vietnamese display name, English industry keywords, aliases, and referenced video works.
 *
 * Never claims unverified roles (e.g. VFX Director, Colorist Specialist) or tools.
 */

export type TagCategory = 'skill' | 'contentType' | 'industry' | 'platform';
export type VerificationLevel = 'verified' | 'inferred' | 'unidentified';

export interface TaxonomyTag {
  id: string;
  category: TagCategory;
  labelVi: string;
  keywordEn: string;
  aliases: string[];
  verifiedLevel: VerificationLevel;
  refVideos: string[];
  descriptionVi?: string;
}

export const TAXONOMY_TAGS: Record<string, TaxonomyTag> = {
  /* ------------------------------------------------------------------ */
  /* A. Chuyên môn / Kỹ thuật (JD Skills)                              */
  /* ------------------------------------------------------------------ */
  'video-editing': {
    id: 'video-editing',
    category: 'skill',
    labelVi: 'Biên tập video',
    keywordEn: 'Video Editing / Post-production',
    aliases: ['Video Editor', 'Cắt dựng video', 'Dựng phim'],
    verifiedLevel: 'verified',
    refVideos: [
      'veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3',
      '0309', 'c1-opt-2', 'dongtaybbs-kb4', 'ip-one-kb45', 'ip-one-kb46',
      'lashe-04', 'bo-03', 'bo-06', 'duc-ung-06', 'nuvi-recap4-01',
    ],
    descriptionVi: 'Cắt dựng thô, chọn lọc cảnh, sắp xếp timeline và tối ưu luồng thị giác.',
  },
  'pacing-storytelling': {
    id: 'pacing-storytelling',
    category: 'skill',
    labelVi: 'Nhịp điệu & Pacing',
    keywordEn: 'Storytelling & Dynamic Pacing',
    aliases: ['Visual Flow', 'Pacing', 'Nhịp dựng'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', '0309', 'nuvi-recap4-01'],
    descriptionVi: 'Kiểm soát nhịp điệu cắt dựng khớp với tiết tấu âm thanh và hành vi xem lướt.',
  },
  'motion-graphics': {
    id: 'motion-graphics',
    category: 'skill',
    labelVi: 'Chuyển động đồ họa cơ bản',
    keywordEn: 'Motion Graphics / Typography',
    aliases: ['Text animation', 'Title card', 'Hiệu ứng chữ'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', 'c1-opt-2', 'dongtaybbs-kb4'],
    descriptionVi: 'Tiêu đề chuyển động, lower-third và hiệu ứng hiển thị thông điệp chính.',
  },
  'audio-sync': {
    id: 'audio-sync',
    category: 'skill',
    labelVi: 'Đồng bộ âm thanh & Sound FX',
    keywordEn: 'Audio Syncing & Sound Design',
    aliases: ['Sound sync', 'BGM editing', 'Hiệu ứng âm thanh'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', '0309', 'nuvi-recap4-01'],
    descriptionVi: 'Căn chỉnh beat nhạc nền, lọc tiếng và chèn sound effect tăng điểm nhấn.',
  },
  'color-grading': {
    id: 'color-grading',
    category: 'skill',
    labelVi: 'Chỉnh màu cơ bản',
    keywordEn: 'Color Correction / Grading',
    aliases: ['Color adjust', 'LUT application', 'Cân chỉnh màu'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', 'c1-opt-2'],
    descriptionVi: 'Cân bằng sáng tối, độ tương phản và áp dụng tone màu phù hợp thương hiệu.',
  },

  /* ------------------------------------------------------------------ */
  /* B. Loại sản phẩm (Content Types)                                   */
  /* ------------------------------------------------------------------ */
  'short-form': {
    id: 'short-form',
    category: 'contentType',
    labelVi: 'Video ngắn 9:16',
    keywordEn: 'Short-form Video',
    aliases: ['Shorts', 'Reels', 'TikTok', 'Vertical Video'],
    verifiedLevel: 'verified',
    refVideos: [
      'veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3',
      '0309', 'c1-opt-2', 'dongtaybbs-kb4', 'ip-one-kb45', 'ip-one-kb46',
      'lashe-04', 'bo-03', 'bo-06', 'duc-ung-06', 'nuvi-recap4-01',
    ],
    descriptionVi: 'Video dọc ngắn thời lượng dưới 60 giây, tối ưu cho nền tảng di động.',
  },
  'commercial': {
    id: 'commercial',
    category: 'contentType',
    labelVi: 'Video thương mại & quảng cáo',
    keywordEn: 'Commercial & Advertising',
    aliases: ['Commercial Video', 'Promo Video', 'Video giới thiệu sản phẩm'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3', 'ip-one-kb45', 'ip-one-kb46', 'lashe-04', 'c1-opt-2'],
    descriptionVi: 'Video truyền thông thương hiệu, nhấn mạnh tính năng và lời kêu gọi hành động.',
  },
  'social-content': {
    id: 'social-content',
    category: 'contentType',
    labelVi: 'Nội dung mạng xã hội',
    keywordEn: 'Social Media Content',
    aliases: ['Social Content', 'Digital Video', 'Content Creator'],
    verifiedLevel: 'verified',
    refVideos: [
      'veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3',
      '0309', 'c1-opt-2', 'dongtaybbs-kb4', 'ip-one-kb45', 'ip-one-kb46',
      'lashe-04', 'bo-03', 'bo-06', 'duc-ung-06', 'nuvi-recap4-01',
    ],
    descriptionVi: 'Video tương tác phân phối trên Facebook, YouTube và các kênh cộng đồng.',
  },
  'recap-event': {
    id: 'recap-event',
    category: 'contentType',
    labelVi: 'Recap & Highlight sự kiện',
    keywordEn: 'Event Recap & Highlights',
    aliases: ['Event Video', 'Highlight', 'Tổng kết sự kiện'],
    verifiedLevel: 'verified',
    refVideos: ['nuvi-recap4-01', 'duc-ung-06'],
    descriptionVi: 'Video cô đọng các khoảnh khắc nổi bật và bầu không khí sự kiện.',
  },

  /* ------------------------------------------------------------------ */
  /* C. Ngành / Lĩnh vực (Industries)                                   */
  /* ------------------------------------------------------------------ */
  'fmcg': {
    id: 'fmcg',
    category: 'industry',
    labelVi: 'FMCG & Hàng tiêu dùng nhanh',
    keywordEn: 'FMCG & Consumer Goods',
    aliases: ['Hàng tiêu dùng', 'FMCG'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3', 'ip-one-kb45', 'ip-one-kb46', 'nuvi-recap4-01'],
    descriptionVi: 'Sản phẩm sữa chua thực vật, chăm sóc gia đình, đồ tiêu dùng nhanh.',
  },
  'beauty-care': {
    id: 'beauty-care',
    category: 'industry',
    labelVi: 'Chăm sóc cá nhân & Làm đẹp',
    keywordEn: 'Beauty & Personal Care',
    aliases: ['Personal Care', 'Làm đẹp', 'Chăm sóc tóc'],
    verifiedLevel: 'verified',
    refVideos: ['lashe-04', 'c1-opt-2'],
    descriptionVi: 'Sản phẩm dầu gội, dưỡng thể và chăm sóc diện mạo cá nhân.',
  },
  'fnb': {
    id: 'fnb',
    category: 'industry',
    labelVi: 'Thực phẩm & Đồ uống (F&B)',
    keywordEn: 'Food & Beverage (F&B)',
    aliases: ['F&B', 'Đồ ăn', 'Đồ uống'],
    verifiedLevel: 'verified',
    refVideos: ['veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3', 'bo-03', 'bo-06'],
    descriptionVi: 'Đồ uống dinh dưỡng, thức uống thảo mộc và thực phẩm ẩm thực.',
  },
  'events-media': {
    id: 'events-media',
    category: 'industry',
    labelVi: 'Sự kiện & Truyền thông',
    keywordEn: 'Events & Media',
    aliases: ['Truyền thông', 'Sự kiện thương hiệu'],
    verifiedLevel: 'verified',
    refVideos: ['nuvi-recap4-01', 'dongtaybbs-kb4'],
    descriptionVi: 'Hoạt động truyền thông thương hiệu, activation và sự kiện cộng đồng.',
  },

  /* ------------------------------------------------------------------ */
  /* D. Nền tảng / Định dạng (Platforms & Formats)                      */
  /* ------------------------------------------------------------------ */
  'vertical-9-16': {
    id: 'vertical-9-16',
    category: 'platform',
    labelVi: 'Định dạng dọc 9:16',
    keywordEn: 'Vertical 9:16',
    aliases: ['9:16', 'TikTok format', 'Shorts format', 'Reels format'],
    verifiedLevel: 'verified',
    refVideos: [
      'veyo-brief-1', 'veyo-brief-2', 'veyo-brief-3',
      '0309', 'c1-opt-2', 'dongtaybbs-kb4', 'ip-one-kb45', 'ip-one-kb46',
      'lashe-04', 'bo-03', 'bo-06', 'duc-ung-06', 'nuvi-recap4-01',
    ],
  },
  'landscape-16-9': {
    id: 'landscape-16-9',
    category: 'platform',
    labelVi: 'Định dạng ngang 16:9',
    keywordEn: 'Landscape 16:9',
    aliases: ['16:9', 'YouTube standard', 'Widescreen'],
    verifiedLevel: 'verified',
    refVideos: [],
  },
  'square-4-5': {
    id: 'square-4-5',
    category: 'platform',
    labelVi: 'Định dạng 4:5 / Vuông',
    keywordEn: 'Square / 4:5 Feed',
    aliases: ['4:5', '1:1', 'Facebook Feed'],
    verifiedLevel: 'verified',
    refVideos: [],
  },
};

/**
 * Curated 2-group taxonomy items for "Lĩnh vực thực hiện" section on the UI.
 * 4 Content Types + 4 Industries = 8 verified tags total.
 */
export const FEATURED_FIELDS = {
  headline: 'Lĩnh vực thực hiện',
  contentTypes: {
    label: 'Loại nội dung',
    items: [
      { id: 'short-form', labelVi: 'Video ngắn 9:16', keywordEn: 'Short-form Video' },
      { id: 'commercial', labelVi: 'Video thương mại & quảng cáo', keywordEn: 'Commercial & Advertising' },
      { id: 'social-content', labelVi: 'Nội dung mạng xã hội', keywordEn: 'Social Media Content' },
      { id: 'recap-event', labelVi: 'Recap & Highlight sự kiện', keywordEn: 'Event Recap & Highlights' },
    ],
  },
  industries: {
    label: 'Ngành / Lĩnh vực',
    items: [
      { id: 'fmcg', labelVi: 'FMCG & Tiêu dùng nhanh', keywordEn: 'FMCG & Consumer Goods' },
      { id: 'beauty-care', labelVi: 'Chăm sóc cá nhân & Làm đẹp', keywordEn: 'Beauty & Personal Care' },
      { id: 'fnb', labelVi: 'Thực phẩm & Đồ uống (F&B)', keywordEn: 'Food & Beverage' },
      { id: 'events-media', labelVi: 'Sự kiện & Truyền thông', keywordEn: 'Events & Media' },
    ],
  },
};
