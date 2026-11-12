#!/usr/bin/env python3
"""
scripts/compare_ab_quality.py
Performs quantitative and visual A/B comparison between:
- Plan A: Baseline Round 04.2 (1440x810 desktop, 720x1280 mobile)
- Plan B: Safe Upscale 04.6 (1920x1080 desktop, 900x1600 mobile)
"""
import os
import math
from PIL import Image, ImageFilter, ImageStat, ImageChops

def get_stats(img, box=None):
    if box:
        img = img.crop(box)
    stat = ImageStat.Stat(img)
    return stat.mean, stat.stddev

def get_edge_energy(img, box=None):
    if box:
        img = img.crop(box)
    gray = img.convert('L')
    edges = gray.filter(ImageFilter.FIND_EDGES)
    stat = ImageStat.Stat(edges)
    return stat.var[0]

def main():
    os.makedirs('media-workspace/evidence_r04_6', exist_ok=True)
    
    # Compare Frame 000 (Hero Initial), Frame 030 (Mid Transition), Frame 055 (Stage 3 Transition)
    frames_to_test = [0, 30, 55]
    
    print("=== A/B QUANTITATIVE EVALUATION ===")
    
    for idx in frames_to_test:
        fname = f"frame_{idx:03d}.webp"
        path_a = os.path.join('public/hero-sequence/desktop', fname)
        path_b = os.path.join('media-workspace/r04_6_candidate/desktop', fname)
        
        im_a = Image.open(path_a).convert('RGB')
        im_b = Image.open(path_b).convert('RGB')
        
        # Scale Plan A up to 1080p using Bilinear (how browser renders on high-DPI screens)
        im_a_disp = im_a.resize((1920, 1080), Image.Resampling.BILINEAR)
        
        # 1. Identity & Geometry preservation: Resize Plan B down to 1440x810 and compute MAE with Plan A
        im_b_down = im_b.resize((1440, 810), Image.Resampling.LANCZOS)
        diff = ImageChops.difference(im_a, im_b_down)
        stat_diff = ImageStat.Stat(diff)
        mae = sum(stat_diff.mean) / 3.0
        
        # 2. Detail Regions
        # Face box at 1080p
        box_face = (1050, 100, 1550, 600)
        # Silver ribbon & Glass edge
        box_glass = (750, 350, 1250, 750)
        # Deep obsidian field
        box_dark = (50, 50, 450, 450)
        
        edge_face_a = get_edge_energy(im_a_disp, box_face)
        edge_face_b = get_edge_energy(im_b, box_face)
        
        edge_glass_a = get_edge_energy(im_a_disp, box_glass)
        edge_glass_b = get_edge_energy(im_b, box_glass)
        
        dark_mean_a, dark_std_a = get_stats(im_a_disp, box_dark)
        dark_mean_b, dark_std_b = get_stats(im_b, box_dark)
        
        print(f"\nFrame {idx:03d}:")
        print(f"  Plan A Size: {os.path.getsize(path_a):,} bytes | Plan B Size: {os.path.getsize(path_b):,} bytes")
        print(f"  Geometry/Color MAE vs Baseline (Scale-normalized): {mae:.2f}/255 (Expect < 3.0)")
        print(f"  Face Edge Crispness:    Plan A={edge_face_a:.1f} -> Plan B={edge_face_b:.1f} (+{(edge_face_b - edge_face_a)/edge_face_a*100:.1f}%)")
        print(f"  Glass Edge Crispness:   Plan A={edge_glass_a:.1f} -> Plan B={edge_glass_b:.1f} (+{(edge_glass_b - edge_glass_a)/edge_glass_a*100:.1f}%)")
        print(f"  Obsidian Noise StdDev:  Plan A={dark_std_a[0]:.2f} -> Plan B={dark_std_b[0]:.2f} (Delta={abs(dark_std_b[0]-dark_std_a[0]):.3f})")
        
        # Save side-by-side visual comparison crop
        c_face_a = im_a_disp.crop(box_face)
        c_face_b = im_b.crop(box_face)
        w, h = c_face_a.size
        comp = Image.new('RGB', (w * 2 + 30, h + 20), (10, 12, 16))
        comp.paste(c_face_a, (10, 10))
        comp.paste(c_face_b, (w + 20, 10))
        comp.save(f'media-workspace/evidence_r04_6/comparison_face_frame_{idx:03d}.png')

    print("\nVisual side-by-side evidence saved to media-workspace/evidence_r04_6/")

if __name__ == '__main__':
    main()

