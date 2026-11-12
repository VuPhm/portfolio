#!/usr/bin/env python3
"""
Creates a 100% clean, art-pure master scene plate from 01-hero-concept.png:
Removes all HTML/UI mockup artifacts (headline, subline, buttons, chevron, top nav),
leaving only the true obsidian background, liquid glass shield, and authentic portrait.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

im = Image.open('/Users/vup/Downloads/hero-scroll-reference-kit/01-hero-concept.png').convert('RGB')
w, h = im.size
clean = im.copy()

# 1. Clean top nav band (y: 0 to 75)
for y in range(75):
    for x in range(w):
        r, g, b = im.getpixel((x, 80))
        factor = 0.82 + 0.18 * (y / 75.0)
        clean.putpixel((x, y), (int(r * factor), int(g * factor), int(b * factor)))

# 2. Clean left typography & buttons (x: 120 to 650, y: 340 to 660)
# In this region, the background is smooth obsidian space between (6, 7, 10) and (10, 11, 14).
# We interpolate from the clean boundary pixels (x=115 on left, x=660 on right, y=330 on top, y=670 on bottom)
for y in range(330, 670):
    t_y = (y - 330) / (670 - 330)
    for x in range(115, 660):
        t_x = (x - 115) / (660 - 115)
        c_left = im.getpixel((115, y))
        c_right = im.getpixel((660, y))
        c_top = im.getpixel((x, 330))
        c_bot = im.getpixel((x, 670))
        
        # 2D bilinear interpolation from clean borders
        val_h = [c_left[i] * (1 - t_x) + c_right[i] * t_x for i in range(3)]
        val_v = [c_top[i] * (1 - t_y) + c_bot[i] * t_y for i in range(3)]
        r = int(0.5 * val_h[0] + 0.5 * val_v[0])
        g = int(0.5 * val_h[1] + 0.5 * val_v[1])
        b = int(0.5 * val_h[2] + 0.5 * val_v[2])
        clean.putpixel((x, y), (r, g, b))

# 3. Clean down chevron & indicator line (x: 810 to 860, y: 840 to 941)
for y in range(840, 941):
    c_left = im.getpixel((805, y))
    c_right = im.getpixel((865, y))
    for x in range(810, 860):
        t_x = (x - 810) / 50.0
        r = int(c_left[0] * (1 - t_x) + c_right[0] * t_x)
        g = int(c_left[1] * (1 - t_x) + c_right[1] * t_x)
        b = int(c_left[2] * (1 - t_x) + c_right[2] * t_x)
        clean.putpixel((x, y), (r, g, b))

# Apply subtle anti-seam feather on the modified region
feathered = clean.crop((110, 320, 665, 680)).filter(ImageFilter.GaussianBlur(radius=2))
clean.paste(feathered, (110, 320))

clean.save('media-workspace/master_clean_plate.png')
print("Pristine master clean plate created successfully.")
