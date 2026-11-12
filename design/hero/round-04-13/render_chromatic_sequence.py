#!/usr/bin/env python3
"""
Reproducible Render Script for Round 04.13 Chromatic Scroll Lighting
Generates 60 WebP frames with non-linear easing and character protection.
"""
import os, math
from PIL import Image, ImageChops, ImageFilter, ImageDraw

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

def render_sequence(master_a_path, master_b_path, mask_char_path, mask_v_path, mask_a_path, out_dir, count=60):
    os.makedirs(out_dir, exist_ok=True)
    im_a = Image.open(master_a_path).convert('RGB')
    im_b = Image.open(master_b_path).convert('RGB')
    w, h = im_a.size
    
    mask_char = Image.open(mask_char_path).convert('L')
    mask_v = Image.open(mask_v_path).convert('L')
    mask_a = Image.open(mask_a_path).convert('L')
    
    for i in range(count):
        p = i / (count - 1)
        wv, wa, rx, ri = get_weights(p)
        mv_w = mask_v.point(lambda v: int(v * wv))
        ma_w = mask_a.point(lambda v: int(v * wa))
        
        mask_wave = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(mask_wave)
        ry = int(680 + 120 * math.sin((rx / w) * math.pi))
        draw.ellipse([rx - 250, ry - 120, rx + 250, ry + 120], fill=int(255 * ri))
        mask_wave_b = mask_wave.filter(ImageFilter.GaussianBlur(radius=80))
        
        chroma = ImageChops.lighter(mv_w, ma_w)
        chroma = ImageChops.lighter(chroma, mask_wave_b)
        blend_mask = ImageChops.subtract(chroma, mask_char)
        
        frame = Image.composite(im_b, im_a, blend_mask)
        frame.save(f'{out_dir}/frame_{i:03d}.webp', 'WEBP', quality=84, method=6)
    
    im_a.save(f'{out_dir}/poster.webp', 'WEBP', quality=88, method=6)
