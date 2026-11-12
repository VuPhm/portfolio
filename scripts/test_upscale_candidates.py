#!/usr/bin/env python3
"""
Test upscale candidates against Round 04.2 baseline.
Evaluates sharpness, haloing, banding, and file size.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

OBSIDIAN = (6, 7, 10)

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def render_desktop_frame(master_im, progress, out_w=1440, out_h=810, sharpen=False):
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
    
    if sharpen:
        # Subtle unsharp mask: crisps fine hair and silver edge without creating noise or halo
        scaled_master = scaled_master.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=3))
        
    paste_x = int((out_w - cur_w) / 2 + offset_x)
    paste_y = int(offset_y)
    canvas.paste(scaled_master, (paste_x, paste_y))
    
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
    os.makedirs('media-workspace/test_upscale', exist_ok=True)
    master = Image.open('media-workspace/master_clean_plate.png').convert('RGB')
    
    # 1. Baseline 1440x810
    f_baseline = render_desktop_frame(master, 0.0, 1440, 810, sharpen=False)
    f_baseline.save('media-workspace/test_upscale/frame_000_baseline_1440.webp', 'WEBP', quality=82)
    f_baseline.save('media-workspace/test_upscale/frame_000_baseline_1440.png')
    
    # 2. 1920x1080 Lanczos only (Q=84)
    f_1080_lanczos = render_desktop_frame(master, 0.0, 1920, 1080, sharpen=False)
    f_1080_lanczos.save('media-workspace/test_upscale/frame_000_1080_lanczos_q84.webp', 'WEBP', quality=84)
    f_1080_lanczos.save('media-workspace/test_upscale/frame_000_1080_lanczos.png')

    # 3. 1920x1080 Lanczos + UnsharpMask (Q=84)
    f_1080_sharp = render_desktop_frame(master, 0.0, 1920, 1080, sharpen=True)
    f_1080_sharp.save('media-workspace/test_upscale/frame_000_1080_sharp_q84.webp', 'WEBP', quality=84)
    f_1080_sharp.save('media-workspace/test_upscale/frame_000_1080_sharp_q86.webp', 'WEBP', quality=86)
    f_1080_sharp.save('media-workspace/test_upscale/frame_000_1080_sharp.png')
    
    print("Test frames generated.")
    for f in os.listdir('media-workspace/test_upscale'):
        fp = os.path.join('media-workspace/test_upscale', f)
        print(f"{f}: {os.path.getsize(fp):,} bytes")

if __name__ == '__main__':
    main()

