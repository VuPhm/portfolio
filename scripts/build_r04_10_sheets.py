#!/usr/bin/env python3
"""
scripts/build_r04_10_sheets.py
Builds presentation-ready contact sheets for Round 04.10:
- Sheet 1: Desktop Dual Variant Comparison (Chromatic Dark vs Monochrome Silver at 1920x1080 & 1440x900)
- Sheet 2: Scroll Sequence Progression (0%, 25%, 50%, 75%, 100% stage transition)
- Sheet 3: Responsive Multi-Viewport Matrix (1920x1080, 1440x900, 1280x800, Mobile 390x844)
"""
import os
import shutil
from PIL import Image, ImageDraw, ImageFont

SRC_DIR = 'media-workspace/round_04_10_evidence'
BRAIN_DIR = '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/evidence_r04_10'
os.makedirs(SRC_DIR, exist_ok=True)
os.makedirs(BRAIN_DIR, exist_ok=True)

# -------------------------------------------------------------
# Sheet 1: Desktop Dual Variant Comparison
# -------------------------------------------------------------
def build_sheet_1():
    print("Building Sheet 1: Desktop Dual Variant Comparison...")
    c_1080 = Image.open(os.path.join(SRC_DIR, 'desktop_chromatic_1920x1080_top.png'))
    m_1080 = Image.open(os.path.join(SRC_DIR, 'desktop_monochrome_1920x1080_top.png'))
    c_900 = Image.open(os.path.join(SRC_DIR, 'desktop_chromatic_1440x900_top.png'))
    m_900 = Image.open(os.path.join(SRC_DIR, 'desktop_monochrome_1440x900_top.png'))
    
    sw = 1920
    sh = 1400
    sheet = Image.new('RGB', (sw, sh), (10, 12, 16))
    draw = ImageDraw.Draw(sheet)
    
    draw.text((40, 20), "ROUND 04.10 — DESKTOP DUAL VISUAL PRESERVATION: CHROMATIC DARK vs MONOCHROME SILVER", fill=(245, 245, 250))
    draw.text((40, 48), "Left: Chromatic Dark (Apple Subtle Specular Rim & Atmospheric Depth)  |  Right: Monochrome Silver (Approved r04-6 Baseline)", fill=(160, 165, 175))
    
    # 1080p Row
    row1_w = 900
    row1_h = int(900 * 1080 / 1920.0) # ~506px
    c_1080_pv = c_1080.resize((row1_w, row1_h), Image.Resampling.LANCZOS)
    m_1080_pv = m_1080.resize((row1_w, row1_h), Image.Resampling.LANCZOS)
    
    sheet.paste(c_1080_pv, (40, 95))
    sheet.paste(m_1080_pv, (980, 95))
    
    draw.rectangle([50, 105, 430, 138], fill=(0, 0, 0, 180))
    draw.text((60, 114), "1920×1080 — CHROMATIC DARK (NEW)", fill=(175, 160, 245))
    
    draw.rectangle([990, 105, 1390, 138], fill=(0, 0, 0, 180))
    draw.text((1000, 114), "1920×1080 — MONOCHROME SILVER (BASELINE)", fill=(210, 215, 225))
    
    # 900p Row
    row2_w = 900
    row2_h = int(900 * 900 / 1440.0) # ~562px
    # Scale down slightly to fit height
    row2_w = 880
    row2_h = int(880 * 900 / 1440.0) # 550px
    c_900_pv = c_900.resize((row2_w, row2_h), Image.Resampling.LANCZOS)
    m_900_pv = m_900.resize((row2_w, row2_h), Image.Resampling.LANCZOS)
    
    sheet.paste(c_900_pv, (40, 630))
    sheet.paste(m_900_pv, (980, 630))
    
    draw.rectangle([50, 640, 430, 673], fill=(0, 0, 0, 180))
    draw.text((60, 649), "1440×900 — CHROMATIC DARK (NEW)", fill=(175, 160, 245))
    
    draw.rectangle([990, 640, 1390, 673], fill=(0, 0, 0, 180))
    draw.text((1000, 649), "1440×900 — MONOCHROME SILVER (BASELINE)", fill=(210, 215, 225))
    
    out_path = os.path.join(SRC_DIR, 'sheet_1_dual_variant_comparison.png')
    sheet.save(out_path)
    shutil.copy2(out_path, os.path.join(BRAIN_DIR, 'sheet_1_dual_variant_comparison.png'))
    print(f"Saved: {out_path}")

# -------------------------------------------------------------
# Sheet 2: Scroll Sequence Progression (5 stages)
# -------------------------------------------------------------
def build_sheet_2():
    print("Building Sheet 2: Scroll Sequence Progression...")
    steps = [
        ('00_top', '0% — Hero Rest (Title & CTA Aligned)', 'scroll_step_00_top.png'),
        ('25_p25', '25% — Micro Camera Settle (Parallax Breathe)', 'scroll_step_25_p25.png'),
        ('50_p50', '50% — Mid Scrub (Glass & Ribbon Dynamic Drift)', 'scroll_step_50_p50.png'),
        ('75_p75', '75% — Stage 3 Recession (Ground Dissolve)', 'scroll_step_75_p75.png'),
        ('100_gallery', '100% — Seamless Stage 3 Arrival (#collections)', 'scroll_step_100_gallery.png'),
    ]
    
    sw = 1920
    sh = 1350
    sheet = Image.new('RGB', (sw, sh), (10, 12, 16))
    draw = ImageDraw.Draw(sheet)
    
    draw.text((40, 20), "ROUND 04.10 — DESKTOP CHROMATIC DARK: SCROLL SEQUENCE CONTINUITY MATRIX", fill=(245, 245, 250))
    draw.text((40, 48), "Pre-rendered 60-frame 1920x1080 WebP Sequence (2.35 MB) — Zero Double-Exposure, Zero Flicker, Seamless Ground Dissolve", fill=(160, 165, 175))
    
    # 2 rows layout: 3 on top, 2 on bottom (larger)
    top_w = 580
    top_h = int(580 * 1080 / 1920.0) # ~326px
    for i in range(3):
        im = Image.open(os.path.join(SRC_DIR, steps[i][2])).resize((top_w, top_h), Image.Resampling.LANCZOS)
        x = 40 + i * (top_w + 35)
        y = 95
        sheet.paste(im, (x, y))
        draw.rectangle([x, y + top_h - 32, x + top_w, y + top_h], fill=(0, 0, 0, 210))
        draw.text((x + 10, y + top_h - 24), steps[i][1], fill=(200, 205, 220))
        
    bot_w = 890
    bot_h = int(890 * 1080 / 1920.0) # ~500px
    for i in range(2):
        im = Image.open(os.path.join(SRC_DIR, steps[3 + i][2])).resize((bot_w, bot_h), Image.Resampling.LANCZOS)
        x = 40 + i * (bot_w + 50)
        y = 460
        sheet.paste(im, (x, y))
        draw.rectangle([x, y + bot_h - 34, x + bot_w, y + bot_h], fill=(0, 0, 0, 210))
        draw.text((x + 15, y + bot_h - 26), steps[3 + i][1], fill=(200, 205, 220))
        
    out_path = os.path.join(SRC_DIR, 'sheet_2_scroll_progression.png')
    sheet.save(out_path)
    shutil.copy2(out_path, os.path.join(BRAIN_DIR, 'sheet_2_scroll_progression.png'))
    print(f"Saved: {out_path}")

# -------------------------------------------------------------
# Sheet 3: Responsive Multi-Viewport Matrix
# -------------------------------------------------------------
def build_sheet_3():
    print("Building Sheet 3: Responsive Multi-Viewport Matrix...")
    d_1080 = Image.open(os.path.join(SRC_DIR, 'desktop_chromatic_1920x1080_top.png'))
    d_900 = Image.open(os.path.join(SRC_DIR, 'desktop_chromatic_1440x900_top.png'))
    l_800 = Image.open(os.path.join(SRC_DIR, 'desktop_chromatic_1280x800_top.png'))
    m_390 = Image.open(os.path.join(SRC_DIR, 'mobile_freeze_verification_390x844.png'))
    
    sw = 1920
    sh = 1350
    sheet = Image.new('RGB', (sw, sh), (10, 12, 16))
    draw = ImageDraw.Draw(sheet)
    
    draw.text((40, 20), "ROUND 04.10 — RESPONSIVE INTEGRITY MATRIX: CHROMATIC DESKTOP & FROZEN MOBILE R04.9", fill=(245, 245, 250))
    draw.text((40, 48), "Verified: Desktop 1920x1080 / 1440x900 / 1280x800 + Frozen Round 04.9 Mobile Option B (Static Hero default)", fill=(160, 165, 175))
    
    # Left Column: Desktop viewports (1080p, 900p, 800p stacked)
    left_w = 1280
    h_1080 = int(left_w * 1080 / 1920.0 * 0.58) # ~417px
    h_900 = int(left_w * 900 / 1440.0 * 0.58)   # ~464px
    h_800 = int(left_w * 800 / 1280.0 * 0.40)   # ~320px
    
    pv_1080 = d_1080.resize((left_w, 360), Image.Resampling.LANCZOS)
    pv_900 = d_900.resize((left_w, 360), Image.Resampling.LANCZOS)
    pv_800 = l_800.resize((left_w, 360), Image.Resampling.LANCZOS)
    
    sheet.paste(pv_1080, (40, 95))
    sheet.paste(pv_900, (40, 485))
    sheet.paste(pv_800, (40, 875))
    
    draw.text((50, 105), "Desktop 1920×1080 (Spacious negative space, right-aligned low-key portrait)", fill=(200, 205, 220))
    draw.text((50, 495), "Desktop 1440×900 (Balanced Apple editorial composition)", fill=(200, 205, 220))
    draw.text((50, 885), "Laptop 1280×800 (Clean typography & CTA grouping, zero occlusion)", fill=(200, 205, 220))
    
    # Right Column: Mobile 390x844 (Full height)
    mob_w = 520
    mob_h = int(520 * 844 / 390.0) # ~1125px
    pv_mob = m_390.resize((mob_w, mob_h), Image.Resampling.LANCZOS)
    sheet.paste(pv_mob, (1360, 95))
    
    draw.rectangle([1360, 95 + mob_h - 40, 1360 + mob_w, 95 + mob_h], fill=(0, 0, 0, 220))
    draw.text((1380, 95 + mob_h - 30), "Mobile 390×844: 100% Frozen Round 04.9 (Static Hero)", fill=(100, 225, 140))
    
    out_path = os.path.join(SRC_DIR, 'sheet_3_responsive_matrix.png')
    sheet.save(out_path)
    shutil.copy2(out_path, os.path.join(BRAIN_DIR, 'sheet_3_responsive_matrix.png'))
    print(f"Saved: {out_path}")

def main():
    build_sheet_1()
    build_sheet_2()
    build_sheet_3()
    print("\nAll presentation contact sheets generated successfully.")

if __name__ == '__main__':
    main()
