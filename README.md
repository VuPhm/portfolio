# Video Editing Portfolio — Round 03.1 (Media Optimization & Cloudflare Delivery)

Portfolio cá nhân chuyên về **Video Editing**, giữ nguyên ngôn ngữ thiết kế **Apple Product Experience × iOS 27 Liquid Glass × Cinematic Video Gallery** và hệ thống **Collection → Video**, đồng thời bổ sung quy trình chuẩn hóa media 3 lớp (**Source → Optimized Media → Delivery**) để vận hành website tốc độ cao với chi phí thấp trên **Cloudflare Pages + Cloudflare R2 Free Tier** và kho nguồn **Google Drive / Local**.

---

## 1. Chiến lược lưu trữ & phân phối 3 lớp (Three-Layer Media Architecture)

1. **Source Layer (Kho nguồn gốc — Read-only):**
   - Lưu bản master chất lượng cao (ProRes, DNxHR, H.264/HEVC bitrate gốc) trên **Google Drive** hoặc ổ cứng local ngoài Git.
   - Ghi nhận vào trường `masterSource` trong manifest/frontmatter để quản trị nguồn, **tuyệt đối không** sửa hoặc xóa file gốc và **không bao giờ** dùng link tải trực tiếp Google Drive (`drive.google.com/uc?...`) làm nguồn phát HTML5 `<video>` công khai.
2. **Optimized Media Layer (Bản nén chuẩn hóa):**
   - `poster`: Ảnh tĩnh `.webp` (`1600×900` cho `16:9` hoặc `900×1600` cho `9:16`), luôn tải trước mọi video.
   - `hover-preview`: Video ngắn `3–8s` (mặc định `5s`), tắt tiếng (`muted`), kích thước vừa khít card (`960×540` hoặc `540×960`), chỉ tải khi rê chuột trên thiết bị desktop.
   - `hero-ambient`: Video nền `6–12s` (mặc định `8s`), tắt tiếng (`muted`), có poster fallback.
   - `web-standard` & `web-high-quality`: Video `.mp4` (H.264 `yuv420p` 8-bit, AAC stereo, `+faststart`), giữ nguyên tỷ lệ `16:9` / `9:16` và FPS gốc, không upscale.
   - `media-workspace/media-manifest.json`: Lưu vết nguồn `masterSource` và toàn bộ `renditions`.
3. **Delivery Layer (Phân phối):**
   - **Cloudflare Pages:** Website tĩnh, poster `.webp`, tài nguyên nhỏ.
   - **Cloudflare R2 Standard:** Video `.mp4` đã nén phục vụ qua Custom Domain (`Cache-Control: public, max-age=31536000, immutable`, hỗ trợ `HTTP Range 206 Partial Content` cho Safari/iPhone, **$0 phí egress**).
   - **YouTube / Vimeo:** Nguồn phát ngoài qua poster facade (chỉ nạp iframe khi người dùng bấm Play).

---

## 2. Cấu trúc thư mục

```text
├── config/
│   ├── media-presets.json        # Cấu hình 5 preset: poster, hover-preview, hero-ambient, web-standard, web-high-quality
│   ├── r2.config.template.json   # Cấu hình mẫu Cloudflare R2 (Custom domain, key pattern, cache headers, ngân sách)
│   └── r2-cors.json              # Chính sách CORS mẫu hỗ trợ HTTP Range (Content-Range, Accept-Ranges)
├── content-intake/
│   ├── README.md                 # Quy trình 5 bước từ Google Drive / Local → Optimize → Website
│   ├── manifest.template.json    # Manifest JSON mẫu (tương thích cả Round 03 & Round 03.1)
│   ├── manifest.template.csv     # Manifest CSV mẫu cho Google Sheets / Excel
│   └── links.template.txt        # Mẫu dán nhanh danh sách link theo nhóm
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── media/
│       ├── covers/               # Ảnh bìa Collection (16:10, khuyên dùng .webp 1600×1000)
│       ├── posters/              # Poster Video (16:9 1600×900 & 9:16 900×1600 .webp)
│       └── og.svg
├── scripts/
│   ├── media-inspect.mjs         # CLI kiểm tra video bằng ffprobe + faststart box analyzer (KEEP/REMUX/TRANSCODE/REVIEW)
│   ├── media-encode.mjs          # CLI chuẩn hóa video bằng FFmpeg local (tuần tự, an toàn cho Mac Intel 16GB, đo SSIM/PSNR/VMAF)
│   ├── r2-adapter.mjs            # CLI sinh kế hoạch R2, đo dung lượng/operations, cảnh báo ngân sách & kiểm thử HTTP Range
│   ├── content-intake.mjs        # CLI nhập nội dung hàng loạt & tự động ghép renditions từ media-manifest.json
│   ├── validate-content.mjs      # CLI kiểm tra trùng lặp, chặn link Google Drive trực tiếp / GIF & kiểm tra dist/
│   └── generate-posters.mjs      # Script tạo poster/cover trừu tượng
├── src/
│   ├── components/
│   │   ├── CinematicStage.astro  # Hero toàn màn hình (poster-first + ambient video nhẹ)
│   │   ├── CollectionCard.astro  # Card hiển thị bộ sưu tập (Series / Channel / Brand)
│   │   ├── EmptyState.astro      # Empty state tinh tế chuẩn Apple khi chưa có tác phẩm publish
│   │   ├── Footer.astro
│   │   ├── Header.astro          # Thanh điều hướng nổi (Liquid Glass)
│   │   ├── PlayerDialog.astro    # Lightbox khởi tạo theo yêu cầu, hỗ trợ multi-rendition fallback
│   │   ├── ScrollStory.astro     # Kiến trúc nền tảng cho Scroll-driven storytelling
│   │   ├── VideoCard.astro       # Card video 16:9 hoặc 9:16 (poster-first, hover-preview thông minh)
│   │   ├── VideoGrid.astro       # Lưới phân tách 16:9 & 9:16, lọc nhanh định dạng & phân trang "Show more"
│   │   └── VideoPlayer.astro     # Trình phát trang chi tiết video (metadata preload, Range-ready)
│   ├── content/
│   │   ├── collections/          # Các file markdown Collection (.md)
│   │   └── videos/               # Các file markdown Video (.md)
│   ├── data/
│   │   └── site.ts               # Thông tin cá nhân, liên hệ, cấu hình personality & demoPreview
│   ├── layouts/
│   │   └── BaseLayout.astro      # Quản lý ambient/hover video tôn trọng reduced-motion, Save-Data & mobile
│   ├── lib/
│   │   ├── content.ts            # Truy vấn, phân nhóm và sắp xếp Collection / Video
│   │   ├── media.ts              # Phân giải nguồn phát (playbackUrl, renditions, chặn Google Drive direct video)
│   │   ├── player.ts             # Dữ liệu cho Lightbox player
│   │   └── scroll-story.ts
│   ├── pages/
│   └── content.config.ts         # Schema mở rộng hỗ trợ masterSource, playbackUrl, previewUrl, deliveryProvider, renditions
```

---

## 3. Quy trình chuẩn hóa video & nhập nội dung (Tóm tắt)

Xem hướng dẫn chi tiết trong [`content-intake/README.md`](./content-intake/README.md):

```bash
# 1. Kiểm tra file master từ Google Drive / thư mục local (KEEP / REMUX / TRANSCODE / REVIEW)
pnpm media:inspect "/duong-dan/kho-nguon-video"

# 2. Chuẩn hóa video & trích xuất poster WebP (xử lý tuần tự, kèm đo chất lượng SSIM/PSNR/VMAF)
pnpm media:encode \
  --input "/duong-dan/kho-nguon-video/film-master.mov" \
  --slug campaign-film \
  --collection seasonal-campaign \
  --preset poster,hover-preview,web-standard \
  --compare

# 3. Kiểm tra dung lượng trước upload, ước lượng chi phí R2 Free Tier & kiểm thử HTTP Range (Safari/iPhone)
pnpm media:verify-range

# 4. Nhập nội dung vào Astro (tự động ghép renditions từ media-workspace/media-manifest.json)
pnpm content:intake --from content-intake/manifest.json --write

# 5. Kiểm tra dữ liệu, TypeScript & toàn vẹn bản build
pnpm content:check
pnpm check
pnpm build
pnpm verify:integrity
```

---

## 4. Danh sách lệnh CLI

| Lệnh | Mô tả |
| :--- | :--- |
| `pnpm media:inspect <path>` | Kiểm tra codec, độ phân giải, bit depth, HDR, `faststart` và gợi ý `KEEP`/`REMUX`/`TRANSCODE`/`REVIEW` |
| `pnpm media:encode --input <file>` | Xuất các preset (`poster`, `hover-preview`, `hero-ambient`, `web-standard`, `web-high-quality`) & so sánh chất lượng (`--compare`) |
| `pnpm media:r2` | Tạo kế hoạch lưu trữ R2, versioned URLs, ước lượng lưu trữ/operations và cảnh báo ngân sách |
| `pnpm media:verify-range` | Kiểm thử HTTP Range (`206 Partial Content`), Safari `bytes=0-1` probe, `moov` header và random seek |
| `pnpm content:intake` | Nhập nội dung hàng loạt từ JSON / CSV / TXT / Folder (tự động nhận diện `renditions`) |
| `pnpm content:check` | Kiểm tra trùng lặp, thiếu poster, chặn URL Google Drive trực tiếp / GIF |
| `pnpm dev` / `pnpm dev:demo` | Chạy development server (`demoPreview = false` / `true`) |
| `pnpm check` | Kiểm tra TypeScript & Astro diagnostics |
| `pnpm build && pnpm verify:integrity` | Build bản tĩnh ra `dist/` và kiểm tra toàn vẹn production |
