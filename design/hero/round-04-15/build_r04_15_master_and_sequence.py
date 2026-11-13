#!/usr/bin/env python3
"""
Round 04.15C — Autonomous Hero Quality Recovery
Builds 1080p Silver & Chromatic masters from native 1K Path B regeneration (Lanczos),
generates 7 keyframes, comparison crops, desktop previews, and 60 WebP scroll frames
preserving Round 04.13 non-linear chromatic easing and character protection.
"""
import hashlib
import json
import math
import os
import shutil
import subprocess
from datetime import datetime, timezone
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = "/Users/vup/Documents/agy/portfolio"
OUT_DIR = os.path.join(ROOT, "design/hero/round-04-15")
R0413_DIR = os.path.join(ROOT, "design/hero/round-04-13")
SEQ_OUT = os.path.join(ROOT, "public/hero-sequence/desktop-chromatic")

SRC_1K_PATH_B = os.path.join(ROOT, "media-workspace/hero-cleanroom-r0415/outputs/r0415c_path_b_clean_1k.jpg")
SRC_1K_CAND_A = os.path.join(ROOT, "media-workspace/hero-cleanroom-r0415/outputs/r0415_master_controlled_regen.jpg")
SRC_1K_R0412 = os.path.join(ROOT, "media-workspace/hero-cleanroom-r0415/references/master_concept_b_subtle_chromatic.jpg")

MASK_CHAR = os.path.join(R0413_DIR, "mask_character_protect.png")
MASK_V = os.path.join(R0413_DIR, "mask_violet.png")
MASK_A = os.path.join(R0413_DIR, "mask_amber.png")


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def get_weights(p):
    if p < 0.18:
        wv = 0.0
    elif p < 0.50:
        wv = smoothstep(0.18, 0.50, p)
    elif p <= 0.68:
        wv = 1.0
    else:
        wv = 1.0 - 0.65 * smoothstep(0.68, 1.00, p)

    if p < 0.22:
        wa = 0.0
    elif p < 0.52:
        wa = smoothstep(0.22, 0.52, p)
    elif p <= 0.68:
        wa = 1.0
    else:
        wa = 1.0 - 0.70 * smoothstep(0.68, 1.00, p)

    if p < 0.18:
        rx = 300.0
        ri = 0.0
    elif p <= 0.68:
        t = (p - 0.18) / (0.68 - 0.18)
        rx = 300.0 + 1300.0 * (t ** 0.85)
        ri = smoothstep(0.18, 0.40, p)
    else:
        rx = 1600.0
        ri = 1.0 - 0.6 * smoothstep(0.68, 1.00, p)

    return wv, wa, rx, ri


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "crops"), exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "keyframes"), exist_ok=True)
    os.makedirs(SEQ_OUT, exist_ok=True)

    # 1. Archive native 1K Path B master (non-private AI output)
    archived_1k = os.path.join(OUT_DIR, "master_1k_path_b.jpg")
    shutil.copy2(SRC_1K_PATH_B, archived_1k)

    # 2. Upscale native 1K (1376x768) -> 1920x1080 lossless PNG via single-pass Lanczos (no UnsharpMask)
    master_chromatic_path = os.path.join(OUT_DIR, "master_1080p_chromatic.png")
    subprocess.run(
        ["ffmpeg", "-y", "-i", archived_1k, "-vf", "scale=1920:1080:flags=lanczos", master_chromatic_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # 3. Derive geometry-locked Silver master (Concept A) from Chromatic master
    # Character inside mask_character_protect stays 100% identical; glass & ribbon outside become monochrome obsidian silver
    im_b = Image.open(master_chromatic_path).convert("RGB")
    mask_char = Image.open(MASK_CHAR).convert("L")
    mask_v = Image.open(MASK_V).convert("L")
    mask_a = Image.open(MASK_A).convert("L")

    im_desat = ImageEnhance.Color(im_b).enhance(0.06)
    im_silver_env = ImageEnhance.Brightness(im_desat).enhance(0.95)
    master_silver = Image.composite(im_b, im_silver_env, mask_char)
    master_silver_path = os.path.join(OUT_DIR, "master_1080p_silver.png")
    master_silver.save(master_silver_path, "PNG")

    # 4. Generate 7 keyframes & contact sheet
    w, h = im_b.size
    keyframe_specs = [
        (0.00, "0% — Silver Intro"),
        (0.18, "18% — Silver Baseline"),
        (0.35, "35% — Chromatic Awakening"),
        (0.50, "50% — Mid Awakening"),
        (0.68, "68% — Chromatic Peak"),
        (0.85, "85% — Transition Settling"),
        (1.00, "100% — Gallery Hand-off"),
    ]

    def render_at_p(p):
        wv, wa, rx, ri = get_weights(p)
        mv_w = mask_v.point(lambda v: int(v * wv))
        ma_w = mask_a.point(lambda v: int(v * wa))
        mask_wave = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(mask_wave)
        ry = int(680 + 120 * math.sin((rx / w) * math.pi))
        draw.ellipse([rx - 250, ry - 120, rx + 250, ry + 120], fill=int(255 * ri))
        mask_wave_b = mask_wave.filter(ImageFilter.GaussianBlur(radius=80))
        chroma = ImageChops.lighter(mv_w, ma_w)
        chroma = ImageChops.lighter(chroma, mask_wave_b)
        blend_mask = ImageChops.subtract(chroma, mask_char)
        return Image.composite(im_b, master_silver, blend_mask)

    kf_thumbs = []
    for p, label in keyframe_specs:
        kf = render_at_p(p)
        kf_path = os.path.join(OUT_DIR, "keyframes", f"keyframe_p{int(round(p * 100)):03d}.png")
        kf.save(kf_path, "PNG")
        kf_thumbs.append((kf.resize((640, 360), Image.Resampling.LANCZOS), label))

    sheet = Image.new("RGB", (640 * 2 + 24, 360 * 4 + 140), (10, 12, 16))
    sdraw = ImageDraw.Draw(sheet)
    for idx, (thumb, label) in enumerate(kf_thumbs):
        col = idx % 2
        row = idx // 2
        x = 8 + col * 648
        y = 28 + row * 384
        sdraw.text((x + 4, y - 20), label, fill=(220, 226, 238))
        sheet.paste(thumb, (x, y))
    sheet.save(os.path.join(OUT_DIR, "keyframe_contact_sheet.png"), "PNG")

    # 5. Generate 1080p 1:1 comparison crops (R04.13 1080p vs R04.15C 1080p) & equal-display-size comparison
    r0413_1080p = Image.open(os.path.join(R0413_DIR, "master_1080p_concept_b.png")).convert("RGB")
    r0412_1k = Image.open(SRC_1K_R0412).convert("RGB")
    candA_1k = Image.open(SRC_1K_CAND_A).convert("RGB")
    pathB_1k = Image.open(archived_1k).convert("RGB")

    # 1080p 1:1 pixel crops
    for cname, box in [("face_1080p", (1200, 225, 1510, 590)), ("hair_ear_nape_1080p", (1400, 250, 1700, 720))]:
        cw, ch = box[2] - box[0], box[3] - box[1]
        comp = Image.new("RGB", (cw * 2 + 36, ch + 44), (16, 18, 24))
        cdraw = ImageDraw.Draw(comp)
        cdraw.text((12, 10), "R04.13 Master B (1080p 1:1)", fill=(225, 230, 240))
        cdraw.text((cw + 24, 10), "R04.15C Path B (1080p 1:1)", fill=(225, 230, 240))
        comp.paste(r0413_1080p.crop(box), (12, 32))
        comp.paste(im_b.crop(box), (cw + 24, 32))
        comp.save(os.path.join(OUT_DIR, "crops", f"compare_{cname}.png"), "PNG")

    # Equal display-size comparison: 1K sources scaled to same 1080p display box for fair 1K vs 1080p evaluation
    for cname, box_1080 in [("face_equal_display", (1200, 225, 1510, 590)), ("hair_equal_display", (1400, 250, 1700, 720))]:
        cw, ch = box_1080[2] - box_1080[0], box_1080[3] - box_1080[1]
        comp = Image.new("RGB", (cw * 4 + 60, ch + 44), (16, 18, 24))
        cdraw = ImageDraw.Draw(comp)
        items = [
            ("R04.12 1K (Scaled)", r0412_1k.resize((1920, 1080), Image.Resampling.LANCZOS)),
            ("R04.15 Cand A 1K (Scaled)", candA_1k.resize((1920, 1080), Image.Resampling.LANCZOS)),
            ("R04.15C Path B 1K (Lanczos)", im_b),
            ("R04.13 1080p (Baseline)", r0413_1080p),
        ]
        for idx, (label, img_obj) in enumerate(items):
            x = 12 + idx * (cw + 12)
            cdraw.text((x, 10), label, fill=(225, 230, 240))
            comp.paste(img_obj.crop(box_1080), (x, 32))
        comp.save(os.path.join(OUT_DIR, "crops", f"compare_{cname}.png"), "PNG")

    # 6. Render 60 WebP frames + poster.webp to public/hero-sequence/desktop-chromatic/
    count = 60
    for i in range(count):
        p = i / (count - 1)
        frame = render_at_p(p)
        frame.save(os.path.join(SEQ_OUT, f"frame_{i:03d}.webp"), "WEBP", quality=86, method=6)
    master_silver.save(os.path.join(SEQ_OUT, "poster.webp"), "WEBP", quality=88, method=6)

    # 7. Write MANIFEST.json
    manifest = {
        "round": "ROUND 04.15C",
        "title": "Autonomous Hero Quality Recovery — Clean Skin, Natural Hair Rim Light & 1080p Lanczos Master",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generation": {
            "model": "gemini-3.1-flash-image (via image-generator subagent)",
            "native_generation_resolution": "1376x768 (1K, 16:9)",
            "upscaled_output_resolution": "1920x1080",
            "upscale_method": "ffmpeg single-pass Lanczos (no UnsharpMask, no super-resolution hallucination)",
            "silver_derivation": "Geometry-locked monochrome obsidian silver outside mask_character_protect.png",
        },
        "sequence": {
            "frames": 60,
            "format": "WEBP",
            "quality": 86,
            "poster_quality": 88,
            "output_dir": "public/hero-sequence/desktop-chromatic",
        },
        "files": {},
    }
    for rel in [
        "master_1k_path_b.jpg",
        "master_1080p_chromatic.png",
        "master_1080p_silver.png",
        "keyframe_contact_sheet.png",
        "crops/compare_face_1080p.png",
        "crops/compare_hair_ear_nape_1080p.png",
        "crops/compare_face_equal_display.png",
        "crops/compare_hair_equal_display.png",
    ]:
        fp = os.path.join(OUT_DIR, rel)
        manifest["files"][rel] = {
            "size_bytes": os.path.getsize(fp),
            "sha256": sha256_file(fp),
        }

    with open(os.path.join(OUT_DIR, "MANIFEST.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print("Round 04.15C master, keyframes, crops, and 60 WebP frames generated successfully.")


if __name__ == "__main__":
    main()

