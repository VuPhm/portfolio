#!/usr/bin/env python3
"""
scripts/build_r04_6_upscale.py
Builds the safe upscale candidate sequence for evaluation:
- Desktop: 1920x1080 (1080p Full HD), subtle unsharp mask (radius=1.1, percent=110, threshold=3) on character plate
- Mobile: 900x1600 (Retina ready for modern phones), subtle unsharp mask
- WebP Quality: Desktop Q=84, Mobile Q=82
- No AI face modification, 100% identity preservation of Variant B baseline.
"""
import math
import os
import json
import time
from PIL import Image, ImageDraw, ImageFilter

OBSIDIAN = (6, 7, 10)

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def render_desktop_frame(master_im, progress, out_w=1920, out_h=1080):
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
    
    # Crisp high-frequency details (hair, eye catchlight, silver specular edge)
    # Threshold=3 strictly protects smooth low-frequency dark gradients from grain
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

def render_mobile_frame(master_im, progress, out_w=900, out_h=1600):
    mw, mh = master_im.size
    mob = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    t = progress
    
    target_char_h = int(out_h * 0.55)
    base_scale = target_char_h / float(mh)
    
    if t <= 0.20:
        drift = math.sin(t / 0.20 * math.pi * 0.5)
        scale = base_scale * (1.0 - 0.005 * drift)
        offset_y = int(out_h * 0.035 - (4 * (out_h / 1280.0)) * drift)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72)
        ground_clear = 0.0
    elif t <= 0.70:
        u = (t - 0.20) / 0.50
        e_u = smoothstep(0.0, 1.0, u)
        scale = base_scale * (0.995 - 0.04 * e_u)
        offset_y = int(out_h * 0.035 - (120 * (out_h / 1280.0)) * e_u)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72 + (8 * (out_w / 720.0)) * e_u)
        ground_clear = 0.3 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = base_scale * (0.955 - 0.025 * e_v)
        offset_y = int(out_h * 0.035 - (270 * (out_h / 1280.0)) * e_v)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72 + (12 * (out_w / 720.0)) * e_v)
        ground_clear = 0.3 + 0.55 * e_v
        
    rw = int(mw * scale)
    rh = int(mh * scale)
    scaled = master_im.resize((rw, rh), Image.Resampling.LANCZOS)
    scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.0, percent=100, threshold=3))
    mob.paste(scaled, (offset_x, offset_y))
    
    fade_start = int(out_h * (0.50 - 0.12 * ground_clear))
    fade_end = int(out_h * (0.66 - 0.10 * ground_clear))
    fade_mask = Image.new('L', (out_w, out_h), 0)
    draw = ImageDraw.Draw(fade_mask)
    for y in range(fade_start, out_h):
        if y >= fade_end:
            val = 255
        else:
            py = (y - fade_start) / float(fade_end - fade_start)
            val = int(255 * (py ** 1.3))
        draw.line([(0, y), (out_w, y)], fill=val)
        
    black = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    mob.paste(black, (0, 0), fade_mask)
    return mob

def main():
    t0 = time.time()
    master_path = 'media-workspace/master_clean_plate.png'
    master = Image.open(master_path).convert('RGB')
    
    desktop_dir = 'media-workspace/r04_6_candidate/desktop'
    mobile_dir = 'media-workspace/r04_6_candidate/mobile'
    os.makedirs(desktop_dir, exist_ok=True)
    os.makedirs(mobile_dir, exist_ok=True)
    
    desktop_count = 60
    mobile_count = 40
    
    print(f"Building Desktop 1920x1080 candidate sequence ({desktop_count} frames)...")
    desktop_bytes = 0
    for i in range(desktop_count):
        progress = i / float(desktop_count - 1)
        frame = render_desktop_frame(master, progress, 1920, 1080)
        out_name = f"frame_{i:03d}.webp"
        out_path = os.path.join(desktop_dir, out_name)
        frame.save(out_path, 'WEBP', quality=84)
        desktop_bytes += os.path.getsize(out_path)
        if i == 0:
            frame.save(os.path.join(desktop_dir, "poster.webp"), 'WEBP', quality=88)
            
    print(f"Building Mobile 900x1600 candidate sequence ({mobile_count} frames)...")
    mobile_bytes = 0
    for i in range(mobile_count):
        progress = i / float(mobile_count - 1)
        frame = render_mobile_frame(master, progress, 900, 1600)
        out_name = f"frame_{i:03d}.webp"
        out_path = os.path.join(mobile_dir, out_name)
        frame.save(out_path, 'WEBP', quality=82)
        mobile_bytes += os.path.getsize(out_path)
        if i == 0:
            frame.save(os.path.join(mobile_dir, "poster.webp"), 'WEBP', quality=86)
            
    print(f"Candidate Sequence Render Done in {time.time() - t0:.2f}s:")
    print(f"  Desktop 1920x1080: {desktop_bytes / 1024 / 1024:.2f} MB ({desktop_bytes:,} bytes)")
    print(f"  Mobile 900x1600:   {mobile_bytes / 1024 / 1024:.2f} MB ({mobile_bytes:,} bytes)")
    print(f"  Total Sequence:    {(desktop_bytes + mobile_bytes) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    main()

