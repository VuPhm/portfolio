#!/usr/bin/env python3
"""
scripts/build_desktop_chromatic_sequence.py
Builds the 60-frame Desktop Chromatic Dark sequence for Round 04.10:
- Master Plate: 1672x941 Artisanal Chromatic Master
  * 100% authentic Variant B portrait pixels (zero face alteration, zero noise)
  * Obsidian #06070a background
  * Subtle muted violet & cool blue specular rim on upper-left glass bevel
  * Soft warm amber specular rim on upper-right glass bevel
  * Apple Intelligence chromatic spectral edge on light ribbon
- Kinematic Model: Identical to approved Round 04.6 baseline for zero jitter & rock-solid pacing
- WebP Quality: Q=84, method=6 for pristine edges under 2.5 MB total
- Generates poster.webp and manifest-chromatic.json
"""
import math
import os
import json
import time
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10)

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def create_master_chromatic_plate(mono_path):
    mono = Image.open(mono_path).convert('RGB')
    mw, mh = mono.size # 1672 x 941
    
    # 1. Subtle deep indigo atmospheric wash in negative space
    chroma_layer = Image.new('RGB', (mw, mh), (0, 0, 0))
    c_draw = ImageDraw.Draw(chroma_layer)
    for r in range(650, 0, -25):
        alpha_factor = ((650 - r) / 650.0) ** 1.8
        ir = int(12 * alpha_factor)
        ig = int(16 * alpha_factor)
        ib = int(32 * alpha_factor)
        c_draw.ellipse([300 - r, 150 - int(r*0.6), 300 + r, 150 + int(r*0.6)], fill=(ir, ig, ib))
    chroma_layer = chroma_layer.filter(ImageFilter.GaussianBlur(radius=60))
    
    result = ImageChops.screen(mono, chroma_layer)
    res_pixels = result.load()
    mono_pixels = mono.load()
    
    for y in range(mh):
        for x in range(mw):
            # Strict protection of face and head
            # Head ellipse: center (1070, 310), rx=140, ry=190
            dx = (x - 1070) / 140.0
            dy = (y - 310) / 190.0
            is_head = (dx*dx + dy*dy) <= 1.05
            is_neck = (990 <= x <= 1180 and 460 <= y <= 620)
            
            if is_head or is_neck:
                res_pixels[x, y] = mono_pixels[x, y]
                continue
                
            r, g, b = res_pixels[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 12:
                continue
                
            # Region A: Upper-left glass curve -> Muted violet
            if 680 <= x <= 960 and 220 <= y <= 550:
                edge_factor = min(1.0, max(0.0, (lum - 15) / 90.0))
                new_r = min(255, int(r * 0.95 + 16 * edge_factor))
                new_g = min(255, int(g * 0.88 + 8 * edge_factor))
                new_b = min(255, int(b * 1.35 + 42 * edge_factor))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
            # Region B: Upper-right glass curve -> Soft warm amber
            elif 1220 <= x <= 1580 and 160 <= y <= 480:
                edge_factor = min(1.0, max(0.0, (lum - 15) / 90.0))
                new_r = min(255, int(r * 1.32 + 38 * edge_factor))
                new_g = min(255, int(g * 1.08 + 18 * edge_factor))
                new_b = min(255, int(b * 0.82 + 4 * edge_factor))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
            # Region C: Sweeping light ribbon across bottom -> Spectral progression
            elif 100 <= x <= 1100 and 480 <= y <= 920:
                edge_factor = min(1.0, max(0.0, (lum - 18) / 100.0))
                prog = max(0.0, min(1.0, (x - 150) / 950.0))
                
                if prog < 0.30: # Cool Blue
                    t = prog / 0.30
                    cr = 0.70 + 0.25 * t
                    cg = 0.85 - 0.05 * t
                    cb = 1.55 - 0.15 * t
                    add_r = int(10 * edge_factor)
                    add_g = int(14 * edge_factor)
                    add_b = int(48 * edge_factor)
                elif prog < 0.65: # Violet / Orchid
                    t = (prog - 0.30) / 0.35
                    cr = 0.95 + 0.30 * t
                    cg = 0.80 - 0.05 * t
                    cb = 1.40 - 0.25 * t
                    add_r = int((10 + 26 * t) * edge_factor)
                    add_g = int((14 - 4 * t) * edge_factor)
                    add_b = int((48 - 14 * t) * edge_factor)
                else: # Soft amber near character
                    t = (prog - 0.65) / 0.35
                    cr = 1.25 + 0.10 * t
                    cg = 0.75 + 0.30 * t
                    cb = 1.15 - 0.35 * t
                    add_r = int((36 + 10 * t) * edge_factor)
                    add_g = int((10 + 12 * t) * edge_factor)
                    add_b = int((34 - 24 * t) * edge_factor)
                    
                new_r = min(255, int(r * cr + add_r))
                new_g = min(255, int(g * cg + add_g))
                new_b = min(255, int(b * cb + add_b))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
    master_chroma_path = 'media-workspace/master_chromatic_plate.png'
    result.save(master_chroma_path)
    print(f"Master Chromatic Plate saved: {master_chroma_path} ({mw}x{mh})")
    return result

def render_desktop_chromatic_frame(master_im, progress, out_w=1920, out_h=1080):
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    t = progress
    sf = out_w / 1440.0
    
    if t <= 0.20:
        drift = math.sin(t / 0.20 * math.pi * 0.5)
        scale = 1.0 - 0.004 * drift
        offset_y = -4.0 * sf * drift
        offset_x = 0.0
        ground_clear = 0.0
    elif t <= 0.70:
        u = (t - 0.20) / 0.50
        e_u = smoothstep(0.0, 1.0, u)
        scale = 0.996 - 0.038 * e_u
        offset_y = (-4.0 - 105.0 * e_u) * sf
        offset_x = 10.0 * sf * e_u
        ground_clear = 0.28 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = 0.958 - 0.02 * e_v
        offset_y = (-109.0 - 135.0 * e_v) * sf
        offset_x = (10.0 + 6.0 * e_v) * sf
        ground_clear = 0.28 + 0.52 * e_v

    cur_w = int(out_w * scale)
    cur_h = int(out_h * scale)
    scaled_master = master_im.resize((cur_w, cur_h), Image.Resampling.LANCZOS)
    
    # Sharp hair catchlight and glass rim without noise
    scaled_master = scaled_master.filter(ImageFilter.UnsharpMask(radius=1.1, percent=105, threshold=3))
    
    paste_x = int((out_w - cur_w) / 2 + offset_x)
    paste_y = int(offset_y)
    canvas.paste(scaled_master, (paste_x, paste_y))
    
    # Ground dissolve: keep lower half dark obsidian for gallery arrival
    if ground_clear > 0.01:
        fade_mask = Image.new('L', (out_w, out_h), 0)
        fdraw = ImageDraw.Draw(fade_mask)
        fade_start = int(out_h * (0.86 - 0.36 * ground_clear))
        fade_full = int(out_h * (0.96 - 0.22 * ground_clear))
        fade_full = max(fade_start + 10, fade_full)
        
        for y in range(fade_start, out_h):
            if y >= fade_full:
                val = int(255 * min(1.0, ground_clear * 1.3))
            else:
                py = (y - fade_start) / float(fade_full - fade_start)
                val = int(255 * (py ** 1.35) * ground_clear)
            fdraw.line([(0, y), (out_w, y)], fill=min(255, val))
            
        black_overlay = Image.new('RGB', (out_w, out_h), OBSIDIAN)
        canvas.paste(black_overlay, (0, 0), fade_mask)
        
    return canvas

def main():
    t0 = time.time()
    mono_path = 'media-workspace/master_clean_plate.png'
    
    print("Creating Master Chromatic Plate...")
    master_chroma = create_master_chromatic_plate(mono_path)
    
    dest_dir = 'public/hero-sequence/desktop-chromatic'
    os.makedirs(dest_dir, exist_ok=True)
    
    # Also ensure desktop-monochrome exists for dual preservation
    mono_dest_dir = 'public/hero-sequence/desktop-monochrome'
    os.makedirs(mono_dest_dir, exist_ok=True)
    
    # Sync existing desktop frames into desktop-monochrome if not already done
    desktop_orig = 'public/hero-sequence/desktop'
    if os.path.exists(desktop_orig):
        import shutil
        for fname in os.listdir(desktop_orig):
            src_f = os.path.join(desktop_orig, fname)
            dst_f = os.path.join(mono_dest_dir, fname)
            if not os.path.exists(dst_f) and os.path.isfile(src_f):
                shutil.copy2(src_f, dst_f)
        print(f"Monochrome Silver frames preserved in {mono_dest_dir}")
        
    desktop_count = 60
    print(f"Rendering Desktop Chromatic sequence ({desktop_count} frames at 1920x1080)...")
    total_bytes = 0
    
    for i in range(desktop_count):
        prog = i / float(desktop_count - 1)
        frame = render_desktop_chromatic_frame(master_chroma, prog, 1920, 1080)
        out_name = f"frame_{i:03d}.webp"
        out_path = os.path.join(dest_dir, out_name)
        frame.save(out_path, 'WEBP', quality=84, method=6)
        sz = os.path.getsize(out_path)
        total_bytes += sz
        
        # Poster from frame 0
        if i == 0:
            poster_path = os.path.join(dest_dir, "poster.webp")
            frame.save(poster_path, 'WEBP', quality=86, method=6)
            print(f"Poster saved: {poster_path} ({os.path.getsize(poster_path)/1024:.1f} KB)")
            
    print(f"Rendered {desktop_count} frames in {time.time()-t0:.1f}s")
    print(f"Total Sequence Size: {total_bytes / (1024*1024):.2f} MB (Budget <= 2.50 MB)")
    
    # Write manifest-chromatic.json
    manifest_chroma = {
        "version": "1.2",
        "variant": "chromatic",
        "description": "VUPHM Cinematic Scroll-Scrubbed Hero (Round 04.10 Chromatic Dark)",
        "desktop": {
            "count": 60,
            "width": 1920,
            "height": 1080,
            "pattern": "/hero-sequence/desktop-chromatic/frame_%03d.webp",
            "poster": "/hero-sequence/desktop-chromatic/poster.webp"
        },
        "mobile": {
            "count": 40,
            "width": 900,
            "height": 1600,
            "pattern": "/hero-sequence/mobile/frame_%03d.webp",
            "poster": "/hero-sequence/mobile/poster.webp"
        }
    }
    with open('public/hero-sequence/manifest-chromatic.json', 'w') as f:
        json.dump(manifest_chroma, f, indent=2)
    print("Saved public/hero-sequence/manifest-chromatic.json")
    
    # Write manifest-monochrome.json
    manifest_mono = {
        "version": "1.2",
        "variant": "monochrome",
        "description": "VUPHM Cinematic Scroll-Scrubbed Hero (Round 04.6 Monochrome Silver Baseline)",
        "desktop": {
            "count": 60,
            "width": 1920,
            "height": 1080,
            "pattern": "/hero-sequence/desktop-monochrome/frame_%03d.webp",
            "poster": "/hero-sequence/desktop-monochrome/poster.webp"
        },
        "mobile": {
            "count": 40,
            "width": 900,
            "height": 1600,
            "pattern": "/hero-sequence/mobile/frame_%03d.webp",
            "poster": "/hero-sequence/mobile/poster.webp"
        }
    }
    with open('public/hero-sequence/manifest-monochrome.json', 'w') as f:
        json.dump(manifest_mono, f, indent=2)
    print("Saved public/hero-sequence/manifest-monochrome.json")

if __name__ == '__main__':
    main()

