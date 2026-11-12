#!/usr/bin/env python3
import math
from PIL import Image, ImageDraw, ImageFilter

im = Image.open('/Users/vup/Downloads/hero-scroll-reference-kit/01-hero-concept.png').convert('RGB')
w, h = im.size
clean = im.copy()

# 1. Top nav band (y: 0 to 75)
for y in range(75):
    for x in range(w):
        r, g, b = im.getpixel((x, 80))
        factor = 0.85 + 0.15 * (y / 75.0)
        clean.putpixel((x, y), (int(r * factor), int(g * factor), int(b * factor)))

# 2. Main headline & subline (x: 130 to 650, y: 350 to 580)
for y in range(350, 580):
    c_left = im.getpixel((125, y))
    c_right = im.getpixel((660, y))
    for x in range(130, 650):
        t_x = (x - 130) / (650 - 130)
        r = int(c_left[0] * (1 - t_x) + c_right[0] * t_x)
        g = int(c_left[1] * (1 - t_x) + c_right[1] * t_x)
        b = int(c_left[2] * (1 - t_x) + c_right[2] * t_x)
        clean.putpixel((x, y), (r, g, b))

# 3. Buttons area (x: 130 to 640, y: 590 to 720)
# Look at the light streak: it enters around x=100, y=940 and sweeps up toward x=750, y=600.
# At x between 130 and 640, the light streak passes through y between 600 and 700!
# Notice: to the left of the button (x=120) and to the right of the button (x=650),
# the streak has a continuous natural intensity.
# Let's reconstruct the buttons area by interpolating along the trajectory of the streak!
for x in range(130, 640):
    t_x = (x - 130) / (640 - 130)
    for y in range(585, 720):
        # sample above button at y=580, and below at y=725
        t_y = (y - 585) / (720 - 585)
        # also blend with horizontal continuity from x=125 and x=645
        c_top = im.getpixel((x, 580))
        c_bot = im.getpixel((x, 725))
        c_left = im.getpixel((125, y))
        c_right = im.getpixel((645, y))
        
        # Vertical interpolation
        rv = c_top[0] * (1 - t_y) + c_bot[0] * t_y
        gv = c_top[1] * (1 - t_y) + c_bot[1] * t_y
        bv = c_top[2] * (1 - t_y) + c_bot[2] * t_y
        
        # Horizontal interpolation
        rh = c_left[0] * (1 - t_x) + c_right[0] * t_x
        gh = c_left[1] * (1 - t_x) + c_right[1] * t_x
        bh = c_left[2] * (1 - t_x) + c_right[2] * t_x
        
        # 50/50 blend gives smooth 2D bi-linear surface
        r = int(0.5 * rv + 0.5 * rh)
        g = int(0.5 * gv + 0.5 * gh)
        b = int(0.5 * bv + 0.5 * bh)
        clean.putpixel((x, y), (r, g, b))

# 4. Chevron at bottom (x: 800 to 870, y: 890 to 941)
for y in range(890, 941):
    c_left = im.getpixel((795, y))
    c_right = im.getpixel((875, y))
    for x in range(800, 870):
        t_x = (x - 800) / 70.0
        r = int(c_left[0] * (1 - t_x) + c_right[0] * t_x)
        g = int(c_left[1] * (1 - t_x) + c_right[1] * t_x)
        b = int(c_left[2] * (1 - t_x) + c_right[2] * t_x)
        clean.putpixel((x, y), (r, g, b))

# Apply subtle smoothing over the restored region
patch = clean.crop((120, 340, 660, 730)).filter(ImageFilter.GaussianBlur(radius=5))
clean.paste(patch, (120, 340))

clean.save('media-workspace/concept_clean_master.png')
print("Refined clean plate saved.")
