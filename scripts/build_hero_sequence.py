#!/usr/bin/env python3
"""
Builds the complete offline pre-rendered cinematic frame sequence
for Desktop (60 frames) and Mobile (40 frames), plus poster assets and manifest.
"""
import math
import os
import json
from PIL import Image, ImageDraw, ImageFilter

OBSIDIAN = (6, 7, 10) # #06070a

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def render_desktop_frame(master_im, progress, out_w=1440, out_h=810):
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    t = progress
    
    # 3-Stage Progression:
    # Stage 1: 0.0 <= t <= 0.20 (Pristine Hero Top)
    # Stage 2: 0.20 < t <= 0.70 (Gentle transition, character recedes, light arcs)
    # Stage 3: 0.70 < t <= 1.00 (Anchor chin/neck in upper right, bottom 50% obsidian for gallery)
    if t <= 0.20:
        drift = math.sin(t / 0.20 * math.pi * 0.5)
        scale = 1.0 - 0.004 * drift
        offset_y = -4 * drift
        offset_x = 0
        ground_clear = 0.0
    elif t <= 0.70:
        u = (t - 0.20) / 0.50
        e_u = smoothstep(0.0, 1.0, u)
        scale = 0.996 - 0.038 * e_u
        offset_y = -4 - 105 * e_u
        offset_x = 10 * e_u
        ground_clear = 0.28 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = 0.958 - 0.02 * e_v
        offset_y = -109 - 135 * e_v
        offset_x = 10 + 6 * e_v
        ground_clear = 0.28 + 0.52 * e_v

    cur_w = int(out_w * scale)
    cur_h = int(out_h * scale)
    scaled_master = master_im.resize((cur_w, cur_h), Image.Resampling.LANCZOS)
    
    paste_x = int((out_w - cur_w) / 2 + offset_x)
    paste_y = int(offset_y)
    canvas.paste(scaled_master, (paste_x, paste_y))
    
    # Lower-half ground dissolve for seamless gallery entry
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

def render_mobile_frame(master_im, progress, out_w=720, out_h=1280):
    mw, mh = master_im.size
    mob = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    t = progress
    
    # Mobile framing: character fills upper portion
    target_char_h = int(out_h * 0.55)
    base_scale = target_char_h / float(mh)
    
    if t <= 0.20:
        drift = math.sin(t / 0.20 * math.pi * 0.5)
        scale = base_scale * (1.0 - 0.005 * drift)
        offset_y = int(out_h * 0.035 - 4 * drift)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72)
        ground_clear = 0.0
    elif t <= 0.70:
        u = (t - 0.20) / 0.50
        e_u = smoothstep(0.0, 1.0, u)
        scale = base_scale * (0.995 - 0.04 * e_u)
        offset_y = int(out_h * 0.035 - 120 * e_u)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72 + 8 * e_u)
        ground_clear = 0.3 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = base_scale * (0.955 - 0.025 * e_v)
        offset_y = int(out_h * 0.035 - 120 - 150 * e_v)
        offset_x = int(out_w * 0.88 - (mw * scale) * 0.72 + 12 * e_v)
        ground_clear = 0.3 + 0.55 * e_v
        
    rw = int(mw * scale)
    rh = int(mh * scale)
    scaled = master_im.resize((rw, rh), Image.Resampling.LANCZOS)
    mob.paste(scaled, (offset_x, offset_y))
    
    # Ground dissolve: keep lower half dark obsidian for mobile HTML text & cards
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
    master_path = 'media-workspace/master_clean_plate.png'
    master = Image.open(master_path).convert('RGB')
    
    desktop_dir = 'public/hero-sequence/desktop'
    mobile_dir = 'public/hero-sequence/mobile'
    os.makedirs(desktop_dir, exist_ok=True)
    os.makedirs(mobile_dir, exist_ok=True)
    
    desktop_count = 60
    mobile_count = 40
    
    print(f"Rendering {desktop_count} desktop frames (1440x810)...")
    for i in range(desktop_count):
        progress = i / float(desktop_count - 1)
        frame = render_desktop_frame(master, progress, 1440, 810)
        out_name = f"frame_{i:03d}.webp"
        frame.save(os.path.join(desktop_dir, out_name), 'WEBP', quality=82)
        if i == 0:
            frame.save(os.path.join(desktop_dir, "poster.webp"), 'WEBP', quality=88)
        if i % 15 == 0 or i == desktop_count - 1:
            print(f"  Desktop frame {i+1}/{desktop_count} rendered.")
            
    print(f"Rendering {mobile_count} mobile frames (720x1280)...")
    for i in range(mobile_count):
        progress = i / float(mobile_count - 1)
        frame = render_mobile_frame(master, progress, 720, 1280)
        out_name = f"frame_{i:03d}.webp"
        frame.save(os.path.join(mobile_dir, out_name), 'WEBP', quality=80)
        if i == 0:
            frame.save(os.path.join(mobile_dir, "poster.webp"), 'WEBP', quality=86)
        if i % 10 == 0 or i == mobile_count - 1:
            print(f"  Mobile frame {i+1}/{mobile_count} rendered.")
            
    # Write manifest
    manifest = {
        "version": "1.0",
        "description": "VUPHM Cinematic Scroll-Scrubbed Hero Frame Sequence",
        "desktop": {
            "count": desktop_count,
            "width": 1440,
            "height": 810,
            "pattern": "/hero-sequence/desktop/frame_%03d.webp",
            "poster": "/hero-sequence/desktop/poster.webp"
        },
        "mobile": {
            "count": mobile_count,
            "width": 720,
            "height": 1280,
            "pattern": "/hero-sequence/mobile/frame_%03d.webp",
            "poster": "/hero-sequence/mobile/poster.webp"
        }
    }
    
    with open('public/hero-sequence/manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)
        
    print("Frame sequence build complete! Manifest saved to public/hero-sequence/manifest.json")

if __name__ == '__main__':
    main()
