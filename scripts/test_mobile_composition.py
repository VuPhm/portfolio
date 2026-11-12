#!/usr/bin/env python3
import math
from PIL import Image, ImageDraw, ImageFilter

OBSIDIAN = (6, 7, 10)

def make_mobile_master(master_path, out_w=720, out_h=1280):
    master = Image.open(master_path).convert('RGB')
    mw, mh = master.size
    
    # Canvas
    mob = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    
    # The character in master is around x: 800 to 1672, y: 100 to 941
    # We want character in upper-right / upper-mid of the mobile screen
    # Scale master so that character height in mobile is ~620px (fills top half)
    target_char_h = int(out_h * 0.54) # ~690px
    scale = target_char_h / float(mh)
    rw = int(mw * scale)
    rh = int(mh * scale)
    scaled = master.resize((rw, rh), Image.Resampling.LANCZOS)
    
    # Place so character's head is in upper portion
    # In master, character is at ~75% width. So paste_x shifts left:
    paste_x = int(out_w * 0.88 - rw * 0.72)
    paste_y = int(out_h * 0.04)
    mob.paste(scaled, (paste_x, paste_y))
    
    # Smooth ground dissolve for lower half negative space
    # Lower half (y > out_h * 0.58) is dedicated for mobile HTML typography & CTAs
    fade_start = int(out_h * 0.48)
    fade_end = int(out_h * 0.65)
    fade_mask = Image.new('L', (out_w, out_h), 0)
    draw = ImageDraw.Draw(fade_mask)
    for y in range(fade_start, out_h):
        if y >= fade_end:
            val = 255
        else:
            t = (y - fade_start) / float(fade_end - fade_start)
            val = int(255 * (t ** 1.3))
        draw.line([(0, y), (out_w, y)], fill=val)
        
    black = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    mob.paste(black, (0, 0), fade_mask)
    
    return mob

mob = make_mobile_master('media-workspace/master_clean_plate.png', 720, 1280)
mob.save('media-workspace/mobile_master_clean.png')
print("Mobile master clean saved.")
