#!/usr/bin/env python3
"""
scripts/diagnose_noise_sources.py
Diagnostic tool for Round 04.9:
Inspects where noise / over-processing / grain originates across:
1. Original photo / isolate: portrait-session-03/final_variant_b_subtle_rim.jpg
2. Master scene 04.2: media-workspace/master_clean_plate.png
3. Round 04.6 mobile frame 0: public/hero-sequence/mobile/frame_000.webp
4. Round 04.6 mobile screenshot: media-workspace/evidence-r04/mobile-390x844-01-initial.png
5. User's latest mobile upload: media_1794485019474_32a8539e.jpg
6. User's latest desktop upload: media_1794485019468_122da372.jpg
"""
import os
from PIL import Image, ImageStat, ImageFilter

SOURCES = {
    '1_variant_b_rim': 'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg',
    '2_master_04_2': 'media-workspace/master_clean_plate.png',
    '3_mobile_frame_04_6': 'public/hero-sequence/mobile/frame_000.webp',
    '4_mobile_screenshot_04_6': 'media-workspace/evidence-r04/mobile-390x844-01-initial.png',
    '5_user_mobile_upload': '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/.user_uploaded/media_1794485019474_32a8539e.jpg',
    '6_user_desktop_upload': '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/.user_uploaded/media_1794485019468_122da372.jpg',
}

OUT_DIR = 'media-workspace/noise_diagnosis'
os.makedirs(OUT_DIR, exist_ok=True)

def analyze_source(name, path):
    if not os.path.exists(path):
        print(f"Skipping {name}: file not found at {path}")
        return None
    im = Image.open(path).convert('RGB')
    w, h = im.size
    print(f"\n--- {name} ({w}x{h}) ---")
    
    # Save a thumbnail / inspection crop
    return im

def main():
    imgs = {}
    for k, p in SOURCES.items():
        im = analyze_source(k, p)
        if im:
            imgs[k] = im
            
    # Let's inspect the facial region of each source:
    # 1. 04.6 Mobile Frame: (900x1600)
    # In 900x1600, where is the face?
    # Let's find face bounds:
    # Character height is ~0.55 * 1600 = 880px, placed at offset_x = ~380, offset_y = 56
    # Face is approximately x: 420..680, y: 150..450
    mf = imgs['3_mobile_frame_04_6']
    crop_mf_face = mf.crop((420, 150, 680, 450))
    crop_mf_face.save(os.path.join(OUT_DIR, 'face_3_mobile_frame_04_6.png'))
    
    # User Mobile Upload: (576x1024)
    # In 576x1024, character is at x: 200..450, y: 120..420
    umu = imgs['5_user_mobile_upload']
    crop_umu_face = umu.crop((200, 120, 450, 420))
    crop_umu_face.save(os.path.join(OUT_DIR, 'face_5_user_mobile_upload.png'))
    
    # 04.6 Screenshot: (780x1688)
    # Face in screenshot
    mss = imgs['4_mobile_screenshot_04_6']
    crop_mss_face = mss.crop((360, 160, 600, 460))
    crop_mss_face.save(os.path.join(OUT_DIR, 'face_4_mobile_screenshot_04_6.png'))

    # Master Clean Plate 04.2: (1672x941)
    # Face in master
    mcp = imgs['2_master_04_2']
    crop_mcp_face = mcp.crop((1020, 100, 1450, 550))
    crop_mcp_face.save(os.path.join(OUT_DIR, 'face_2_master_04_2.png'))
    
    # User Desktop Upload: (1024x576)
    # Face in user desktop upload
    udu = imgs['6_user_desktop_upload']
    crop_udu_face = udu.crop((620, 60, 890, 340))
    crop_udu_face.save(os.path.join(OUT_DIR, 'face_6_user_desktop_upload.png'))

    # Measure noise on cheek / skin in each crop:
    # We measure high-frequency variance on skin patches
    print("\nSkin Texture & High-Frequency Noise Measurements:")
    for label, crop in [
        ('Master 04.2', crop_mcp_face),
        ('Mobile Frame 04.6', crop_mf_face),
        ('Mobile Screenshot 04.6', crop_mss_face),
        ('User Mobile Upload', crop_umu_face),
        ('User Desktop Upload', crop_udu_face),
    ]:
        # Resize to common display size: 240x280
        norm = crop.resize((240, 280), Image.Resampling.LANCZOS)
        gray = norm.convert('L')
        # High pass / edge filter
        edges = gray.filter(ImageFilter.FIND_EDGES)
        stat = ImageStat.Stat(edges)
        edge_var = stat.var[0]
        # Dark noise (corners)
        dark_corner = norm.crop((0, 0, 40, 40))
        dark_stat = ImageStat.Stat(dark_corner)
        print(f"  {label:24s}: Edge Energy={edge_var:6.1f} | Dark Corner StdDev={dark_stat.stddev[0]:.2f}")
        norm.save(os.path.join(OUT_DIR, f'norm_{label.replace(" ", "_")}.png'))

if __name__ == '__main__':
    main()

