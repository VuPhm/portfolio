#!/usr/bin/env python3
"""
Renders motion frames and contact sheet for Gate B evaluation.
Ensures zero black void at Stage 3: Upper half anchors chin/neck/streak
while bottom half seamlessly welcomes incoming HTML gallery cards.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10) # #06070a

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def render_frame_desktop(master_im, progress, out_w=1600, out_h=900):
    mw, mh = master_im.size
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    t = progress
    
    # Storyboard 3-stage progression:
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
        scale = 0.996 - 0.036 * e_u
        offset_y = -4 - 110 * e_u
        offset_x = 10 * e_u
        ground_clear = 0.3 * e_u
    else:
        v = (t - 0.70) / 0.30
        e_v = smoothstep(0.0, 1.0, v)
        scale = 0.96 - 0.02 * e_v
        # At t=1.0, offset_y moves head partially above frame, keeping chin/neck/collar visible in upper 45%
        offset_y = -114 - 140 * e_v
        offset_x = 10 + 6 * e_v
        ground_clear = 0.3 + 0.5 * e_v

    cur_w = int(out_w * scale)
    cur_h = int(out_h * scale)
    scaled_master = master_im.resize((cur_w, cur_h), Image.Resampling.LANCZOS)
    
    paste_x = int((out_w - cur_w) / 2 + offset_x)
    paste_y = int(offset_y)
    canvas.paste(scaled_master, (paste_x, paste_y))
    
    # Ground dissolve: Only dissolves the lower half (y > out_h * 0.48), NEVER the upper half
    if ground_clear > 0.01:
        fade_mask = Image.new('L', (out_w, out_h), 0)
        fdraw = ImageDraw.Draw(fade_mask)
        
        # Upper cutoff: fade never touches y < out_h * 0.46
        fade_start = int(out_h * (0.85 - 0.35 * ground_clear))
        fade_full = int(out_h * (0.95 - 0.20 * ground_clear))
        fade_full = max(fade_start + 10, fade_full)
        
        for y in range(fade_start, out_h):
            if y >= fade_full:
                val = int(255 * min(1.0, ground_clear * 1.3))
            else:
                py = (y - fade_start) / float(fade_full - fade_start)
                val = int(255 * (py ** 1.4) * ground_clear)
            fdraw.line([(0, y), (out_w, y)], fill=min(255, val))
            
        black_overlay = Image.new('RGB', (out_w, out_h), OBSIDIAN)
        canvas.paste(black_overlay, (0, 0), fade_mask)
        
    return canvas

def make_contact_sheet(master_path, out_sheet_path):
    master = Image.open(master_path).convert('RGB')
    milestones = [0.0, 0.25, 0.50, 0.75, 1.0]
    labels = ["0% (Hero Top)", "25% (Transition Start)", "50% (Mid Parallax)", "75% (Content Reveal)", "100% (Stage 3 Flow)"]
    
    frame_w, frame_h = 640, 360
    sheet_w = frame_w
    sheet_h = frame_h * len(milestones) + 40 * len(milestones)
    
    sheet = Image.new('RGB', (sheet_w, sheet_h), (10, 12, 16))
    draw = ImageDraw.Draw(sheet)
    
    for i, (m, lbl) in enumerate(zip(milestones, labels)):
        f = render_frame_desktop(master, m, frame_w, frame_h)
        y_pos = i * (frame_h + 40)
        draw.text((20, y_pos + 12), f"Milestone: {lbl} — Progress: {int(m*100)}%", fill=(220, 230, 245))
        sheet.paste(f, (0, y_pos + 36))
        
    sheet.save(out_sheet_path)
    print(f"Contact sheet saved to {out_sheet_path}")

make_contact_sheet('media-workspace/master_clean_plate.png', 'media-workspace/evidence-r04/gate_b_contact_sheet.png')
