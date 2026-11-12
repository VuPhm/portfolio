#!/usr/bin/env python3
"""
scripts/build_r04_9_mobile_assets.py
Generates the clean mobile sequence and static poster for Round 04.9:
- Uses clean_mobile_plate.jpg
- offset_x = 24 (character naturally positioned in upper-right quadrant)
- ZERO artificial sharpening (preserves organic skin texture and eliminates gritty noise)
- Pure obsidian dissolve in lower 42%
- Outputs to public/hero-sequence/mobile/
"""
import os
import math
import time
from PIL import Image, ImageDraw

OBSIDIAN = (6, 7, 10) # #06070a

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def render_clean_mobile_frame(src_im, progress, out_w=900, out_h=1600):
    sw, sh = src_im.size
    t = progress
    
    # Scale from 576 to 900
    base_scale = out_w / float(sw)
    
    # Intentional upper-right placement: offset_x starts at +24
    base_offset_x = 24
    
    if t <= 0.20:
        drift = math.sin(t / 0.20 * math.pi * 0.5)
        scale = base_scale * (1.0 - 0.003 * drift)
        offset_y = int(-4 * drift)
        offset_x = base_offset_x
        ground_clear = 0.0
    elif t <= 0.70:
        u = (t - 0.20) / 0.50
        e_u = smoothstep(0.0, 1.0, u)
        scale = base_scale * (0.997 - 0.03 * e_u)
        offset_y = int(-4 - 95 * e_u)
        offset_x = int(base_offset_x + 6 * e_u)
        ground_clear = 0.32 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = base_scale * (0.967 - 0.02 * e_v)
        offset_y = int(-99 - 130 * e_v)
        offset_x = int(base_offset_x + 6 + 4 * e_v)
        ground_clear = 0.32 + 0.53 * e_v

    cur_w = int(sw * scale)
    cur_h = int(sh * scale)
    
    # High-quality Lanczos resampling with NO artificial unsharp mask
    scaled = src_im.resize((cur_w, cur_h), Image.Resampling.LANCZOS)
    
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    paste_x = int((out_w - cur_w) / 2 + offset_x)
    paste_y = int(offset_y)
    canvas.paste(scaled, (paste_x, paste_y))
    
    # Seamless dissolve into obsidian for the lower section
    fade_start = int(out_h * (0.58 - 0.12 * ground_clear))
    fade_end = int(out_h * (0.76 - 0.08 * ground_clear))
    fade_mask = Image.new('L', (out_w, out_h), 0)
    draw = ImageDraw.Draw(fade_mask)
    
    for y in range(fade_start, out_h):
        if y >= fade_end:
            val = 255
        else:
            py = (y - fade_start) / float(fade_end - fade_start)
            val = int(255 * (py ** 1.35))
        draw.line([(0, y), (out_w, y)], fill=val)
        
    black_overlay = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    canvas.paste(black_overlay, (0, 0), fade_mask)
    return canvas

def main():
    t0 = time.time()
    src_path = 'media-workspace/clean_mobile_plate.jpg'
    src = Image.open(src_path).convert('RGB')
    
    out_dir = 'public/hero-sequence/mobile'
    os.makedirs(out_dir, exist_ok=True)
    
    # Static Poster (clean 900x1600 WebP, Q=85)
    poster = render_clean_mobile_frame(src, 0.0, 900, 1600)
    poster.save(os.path.join(out_dir, 'poster.webp'), 'WEBP', quality=85)
    print(f"Clean poster saved: {os.path.getsize(os.path.join(out_dir, 'poster.webp')):,} bytes")
    
    # 40 Sequence Frames (Q=80)
    print("Generating 40 clean mobile frames...")
    total_bytes = 0
    for i in range(40):
        progress = i / 39.0
        frame = render_clean_mobile_frame(src, progress, 900, 1600)
        p = os.path.join(out_dir, f"frame_{i:03d}.webp")
        frame.save(p, 'WEBP', quality=80)
        total_bytes += os.path.getsize(p)
        
    print(f"Mobile assets generated in {time.time() - t0:.2f}s:")
    print(f"  Poster: {os.path.getsize(os.path.join(out_dir, 'poster.webp')) / 1024:.1f} KB")
    print(f"  40 frames: {total_bytes / 1024 / 1024:.2f} MB ({total_bytes:,} bytes)")

if __name__ == '__main__':
    main()
