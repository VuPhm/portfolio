# Quy Trình Chuẩn Hóa Media, Lưu Trữ 3 Lớp & Nhập Nội Dung (Round 03.1)

Thư mục `content-intake/` kết hợp với bộ công cụ CLI trong `scripts/` cung cấp quy trình khép kín từ **kho nguồn Google Drive / ổ cứng local → kiểm tra (`ffprobe`) → tối ưu (`ffmpeg`) → chuẩn bị Cloudflare R2 → xuất bản lên website** với chi phí vận hành bằng **\$0** (tận dụng Cloudflare Pages + Cloudflare R2 Free Tier).

---

## 1. Chiến lược lưu trữ 3 lớp (Three-Layer Storage Strategy)

| Lớp | Mục đích & Định dạng | Nơi lưu trữ | Quy tắc an toàn |
| :--- | :--- | :--- | :--- |
| **1. Source (Kho nguồn)** | Bản master chất lượng gốc (ProRes, DNxHR, H.264/HEVC bitrate cao) | **Google Drive** (Google Drive for Desktop / thư mục đồng bộ) hoặc ổ cứng local ngoài Git | **Read-only tuyệt đối:** Công cụ CLI không bao giờ sửa, ghi đè hoặc xóa file gốc. Ghi nhận trong trường `masterSource`. |
| **2. Optimized Media (Bản tối ưu)** | • `poster` (`.webp` tĩnh)<br>• `hover-preview` (3–8s muted `.mp4`)<br>• `hero-ambient` (6–12s muted `.mp4`)<br>• `web-standard` / `web-high-quality` (`.mp4` H.264 + AAC + `faststart`)<br>• `media-manifest.json` (lưu thông tin nguồn & renditions) | • Poster: `public/media/posters/<slug>.webp`<br>• Video đã nén: `media-workspace/optimized/` (nằm trong `.gitignore`, không đẩy vào Git) | Giữ nguyên tỷ lệ gốc `16:9` hoặc `9:16`, không upscale, không đổi FPS, không tự ép HDR sang SDR nếu thiếu tone-mapping. |
| **3. Delivery (Phân phối)** | • Website HTML/CSS/JS + Poster `.webp`<br>• Video `.mp4` đã nén có `faststart`<br>• Nguồn phát ngoài khi phù hợp | • **Cloudflare Pages** (website + poster)<br>• **Cloudflare R2 Standard** (video `.mp4` qua custom domain)<br>• **YouTube / Vimeo** (embed facade chỉ tải khi bấm Play) | **Tuyệt đối không** dùng URL tải trực tiếp Google Drive (`drive.google.com/uc?id=...`) làm nguồn `<video>` HTML5 công khai. |

---

## 2. Quy trình 5 bước: Từ Google Drive / Local → Optimize → Website

### Bước 1 — Kiểm tra file nguồn bằng `pnpm media:inspect` (`ffprobe`)

Trỏ trực tiếp vào file lẻ hoặc thư mục Google Drive / thư mục local chứa bản master:

```bash
pnpm media:inspect "/Volumes/GoogleDrive/My Drive/Portfolio-Masters"
```

Công cụ sẽ phân tích codec, container, độ phân giải, tỷ lệ (`16:9` / `9:16`), FPS (CFR/VFR), bitrate, audio codec, pixel format (`yuv420p` 8-bit hay `yuv422p10le` 10-bit), không gian màu, HDR metadata (`PQ` / `HLG` / `BT.2020` / Dolby Vision), vị trí `moov` atom (`faststart`) và đưa ra gợi ý:

- **`KEEP`**: Đã đạt chuẩn H.264 8-bit `yuv420p` SDR trong `.mp4` có `faststart`, bitrate và độ phân giải nằm trong ngưỡng web → **Không re-encode** để giữ 100% chất lượng.
- **`REMUX`**: Luồng video/audio đã đạt chuẩn nhưng nằm trong `.mov`/`.mkv` hoặc thiếu `faststart` → Chỉ cần đóng gói lại (`-c copy -movflags +faststart`) trong < 1 giây, **0% suy giảm chất lượng**.
- **`TRANSCODE`**: Nguồn là ProRes, HEVC, 10-bit 4:2:2 hoặc bitrate/độ phân giải quá lớn → Nén sang H.264 MP4 chuẩn web.
- **`REVIEW`**: Phát hiện HDR (`PQ` / `HLG` / `BT.2020`), interlaced hoặc tỷ lệ khung hình lạ → Dừng và cảnh báo để xử lý màu chủ động (xuất bản SDR Rec.709 từ DaVinci Resolve/Premiere hoặc truyền cờ `--tonemap hable`).

---

### Bước 2 — Xuất các bản tối ưu bằng `pnpm media:encode` (`ffmpeg`)

Các preset có sẵn trong `config/media-presets.json`:

| Preset | Đầu ra | Âm thanh | Độ phân giải tối đa (Không upscale) | Thông số mặc định | Mục đích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `poster` | `.webp` | Không | `1600×900` (`16:9`) / `900×1600` (`9:16`) | Quality `82` | Ảnh đại diện tải trước mọi video |
| `hover-preview` | `.mp4` (3–8s, mặc định 5s) | Muted (`-an`) | `960×540` (`16:9`) / `540×960` (`9:16`) | H.264 Main@3.1, CRF `24`, `faststart` | Xem trước khi rê chuột trên card (desktop) |
| `hero-ambient` | `.mp4` (5–12s, mặc định 8s) | Muted (`-an`) | `1920×1080` (`16:9`) / `1080×1920` (`9:16`) | H.264 High@4.1, CRF `22`, AQ3, `faststart` | Nền chuyển động nhẹ cho Hero stage |
| `web-standard` | `.mp4` (Full) | AAC 160k | `1920×1080` (`16:9`) / `1080×1920` (`9:16`) | H.264 High@4.1, CRF `20`, `slow`, `faststart` | Phát chính cho phần lớn video portfolio |
| `web-high-quality` | `.mp4` (Full) | AAC 192k | `2560×1440` (`16:9`) / `1440×2560` (`9:16`) | H.264 High@5.1, CRF `18`, `slow`, `faststart` | Phim Hero / tác phẩm đòi hỏi chi tiết vùng tối cao |

**Ví dụ chạy lệnh (tuần tự, tối ưu cho Mac Intel 16GB):**

```bash
# Xuất poster + hover-preview + web-standard kèm đo chất lượng SSIM/PSNR/VMAF trước/sau
pnpm media:encode \
  --input "/Volumes/GoogleDrive/My Drive/Portfolio-Masters/campaign-hero.mov" \
  --slug campaign-hero-cut \
  --collection brand-campaign-slug \
  --preset poster,hover-preview,web-standard \
  --compare

# Tùy chỉnh điểm cắt preview (--ss), thời lượng (--duration 3..8) hoặc CRF (--crf)
pnpm media:encode \
  --input "/path/to/vertical-short.mp4" \
  --slug daily-frames-pulse \
  --collection daily-frames \
  --preset poster,hover-preview,web-standard \
  --ss 2.0 --duration 5 --crf 20

# Nếu nguồn là HDR và muốn chuyển sang SDR bằng Hable tone-mapping:
pnpm media:encode \
  --input "/path/to/hdr-master.mov" \
  --slug hdr-cut \
  --preset poster,web-standard \
  --tonemap hable
```

Poster `.webp` được tự động đặt vào `public/media/posters/<slug>.webp` và metadata của mọi bản encode được lưu vào `media-workspace/media-manifest.json`.

---

### Bước 3 — Chuẩn bị cấu hình Cloudflare R2 & Kiểm tra ngân sách + HTTP Range

```bash
pnpm media:verify-range
```

Công cụ `scripts/r2-adapter.mjs` sẽ:
1. Sinh object key chuẩn theo cấu trúc `collections/<collection>/<slug>/<preset>.<hash8>.mp4` (hoặc `standalone/<slug>/...`) và URL có gắn mã phiên bản (`versioned URL`) để bật `Cache-Control: public, max-age=31536000, immutable`.
2. Tính tổng dung lượng lưu trữ (GB) và ước lượng số lượng **Class A / Class B operations** hàng tháng, đối chiếu với hạn mức **Cloudflare R2 Free Tier** (`10 GB` lưu trữ, `1,000,000` Class A ops, `10,000,000` Class B ops, **$0 phí băng thông egress**).
3. Cảnh báo ngay nếu dung lượng hoặc lượt truy cập vượt ngưỡng ngân sách cấu hình trong `config/r2.config.template.json`.
4. Khởi chạy máy chủ kiểm thử HTTP Range nội bộ để xác minh `206 Partial Content`, `Accept-Ranges: bytes`, probe 2-byte bắt buộc của **Safari/iPhone (`Range: bytes=0-1`)**, `moov` atom trong 64KB đầu tiên (`faststart`) và khả năng tua ngẫu nhiên (`Random Seek`).

---

### Bước 4 — Nhập vào hệ thống Content (`pnpm content:intake`)

Công cụ `pnpm content:intake` tự động đọc `media-workspace/media-manifest.json` để ghép `masterSource`, `poster`, `previewUrl`, `playbackUrl`, `deliveryProvider` và `renditions` vào từng video (vẫn tương thích 100% với manifest Round 03 cũ):

```bash
# Xem trước kế hoạch nhập (dry-run)
pnpm content:intake --from content-intake/manifest.json

# Ghi file markdown vào src/content/collections/ và src/content/videos/
pnpm content:intake --from content-intake/manifest.json --write
```

---

### Bước 5 — Kiểm tra toàn vẹn & Build

```bash
pnpm content:check
pnpm check
pnpm build
pnpm verify:integrity
```
