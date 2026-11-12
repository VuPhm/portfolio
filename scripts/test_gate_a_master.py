#!/usr/bin/env python3
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10) # #06070a

def make_stage(w, h):
    # Deep obsidian base with very subtle atmospheric gradients
    img = Image.new('RGB', (w, h), OBSIDIAN)
    
    # Soft radial glow behind character position (around 66% width, 50% height)
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    draw = ImageDraw.Draw(glow)
    cx, cy = int(w * 0.68), int(h * 0.48)
    radius = int(h * 0.7)
    steps = 40
    for i in range(steps, 0, -1):
        r = int(radius * (i / steps))
        val = int(22 * (1.0 - (i / steps) ** 1.3))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(int(val * 0.85), int(val * 0.95), val))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius * 0.15))
    return ImageChops.add(img, glow)

def render_slanted_glass(w, h, cx, cy, gw, gh, angle_deg, radius=110):
    """
    Renders an Apple-inspired tilted rounded liquid glass shield
    with frosted refraction, inner gradient, and specular rim lighting.
    """
    # Render at 2x resolution for super-sampled anti-aliasing
    scale = 2
    sw, sh = w * scale, h * scale
    sgw, sgh = int(gw * scale), int(gh * scale)
    srad = int(radius * scale)
    
    # Create isolated un-rotated panel
    panel = Image.new('RGBA', (sgw, sgh), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(panel)
    
    # 1. Base frosted glass body (translucent dark silver)
    pdraw.rounded_rectangle([0, 0, sgw, sgh], radius=srad, fill=(24, 30, 42, 110))
    
    # 2. Gradient fill inside the glass (brighter on top-left, darker on bottom-right)
    grad = Image.new('RGBA', (sgw, sgh), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    for y in range(sgh):
        t = y / float(sgh)
        alpha = int(45 * (1.0 - t))
        gdraw.line([(0, y), (sgw, y)], fill=(80, 105, 140, alpha))
    grad = grad.filter(ImageFilter.GaussianBlur(radius=15 * scale))
    panel = Image.alpha_composite(panel, grad)
    
    # 3. Specular rim highlight (crisp silver stroke with directional falloff)
    rim = Image.new('RGBA', (sgw, sgh), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rim)
    rdraw.rounded_rectangle([0, 0, sgw, sgh], radius=srad, outline=(240, 248, 255, 230), width=int(2.2 * scale))
    
    # Mask to keep highlight only on top and left/upper rim
    rim_mask = Image.new('L', (sgw, sgh), 0)
    rmdraw = ImageDraw.Draw(rim_mask)
    for y in range(sgh):
        t = y / float(sgh)
        val = int(255 * max(0.0, 1.0 - (t * 1.25) ** 1.1))
        rmdraw.line([(0, y), (sgw, y)], fill=val)
    rim.putalpha(ImageChops.multiply(rim.split()[3], rim_mask))
    
    # Soft bloom around rim
    rim_bloom = rim.filter(ImageFilter.GaussianBlur(radius=2.5 * scale))
    panel = Image.alpha_composite(panel, rim_bloom)
    panel = Image.alpha_composite(panel, rim)
    
    # Rotate panel
    # We rotate around center with expansion
    rotated = panel.rotate(-angle_deg, resample=Image.Resampling.BICUBIC, expand=True)
    rw, rh = rotated.size
    
    # Place onto canvas at (cx, cy)
    full = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    paste_x = int(cx * scale - rw / 2)
    paste_y = int(cy * scale - rh / 2)
    full.paste(rotated, (paste_x, paste_y), rotated)
    
    return full.resize((w, h), Image.Resampling.LANCZOS)

def render_luminous_streak(w, h, p0, p1, p2, p3, width_base=75, intensity=1.0):
    """
    Renders an ethereal curved light sweep with soft gaussian aura and silver spine.
    """
    scale = 2
    sw, sh = w * scale, h * scale
    sp0 = (int(p0[0] * scale), int(p0[1] * scale))
    sp1 = (int(p1[0] * scale), int(p1[1] * scale))
    sp2 = (int(p2[0] * scale), int(p2[1] * scale))
    sp3 = (int(p3[0] * scale), int(p3[1] * scale))
    
    steps = 240
    pts = []
    for i in range(steps + 1):
        t = i / float(steps)
        bx = (1-t)**3 * sp0[0] + 3*(1-t)**2 * t * sp1[0] + 3*(1-t) * t**2 * sp2[0] + t**3 * sp3[0]
        by = (1-t)**3 * sp0[1] + 3*(1-t)**2 * t * sp1[1] + 3*(1-t) * t**2 * sp2[1] + t**3 * sp3[1]
        pts.append((bx, by))
        
    layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    
    # 1. Broad soft ambient glow
    broad = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(broad)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(75 * intensity * taper)
        bdraw.line([pts[i], pts[i+1]], fill=(190, 215, 245, alpha), width=int(width_base * 1.8 * scale))
    broad = broad.filter(ImageFilter.GaussianBlur(radius=36 * scale))
    layer = Image.alpha_composite(layer, broad)
    
    # 2. Mid ribbon
    mid = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(mid)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(120 * intensity * taper)
        mdraw.line([pts[i], pts[i+1]], fill=(225, 238, 255, alpha), width=int(width_base * 0.7 * scale))
    mid = mid.filter(ImageFilter.GaussianBlur(radius=14 * scale))
    layer = Image.alpha_composite(layer, mid)
    
    # 3. Brilliant silver core
    core = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(240 * intensity * taper)
        cdraw.line([pts[i], pts[i+1]], fill=(255, 255, 255, alpha), width=int(4.5 * scale))
    core = core.filter(ImageFilter.GaussianBlur(radius=2.8 * scale))
    layer = Image.alpha_composite(layer, core)
    
    return layer.resize((w, h), Image.Resampling.LANCZOS)

def isolate_portrait(port_path, target_h):
    """
    Isolates portrait Variant B with 100% solid facial features, eyes, hair,
    clean left contour ramp for glass/light integration, and bottom floor dissolution.
    """
    port = Image.open(port_path).convert('RGB')
    pw, ph = port.size
    target_w = int(pw * (target_h / float(ph)))
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Detect left face/hair contour
    face_left = []
    for y in range(target_h):
        found_l = target_w
        for x in range(target_w // 2):
            r, g, b = port_res.getpixel((x, y))
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 9.0:
                found_l = x
                break
        face_left.append(found_l)
        
    smooth_left = []
    k = 6
    for y in range(target_h):
        y_min = max(0, y - k)
        y_max = min(target_h, y + k + 1)
        smooth_left.append(sum(face_left[y_min:y_max]) / float(y_max - y_min))
        
    mask = Image.new('L', (target_w, target_h), 255)
    feather_w = 24.0
    fade_b = 110.0
    fade_t = 25.0
    
    for y in range(target_h):
        edge_x = smooth_left[y]
        vert_factor = 1.0
        if y < fade_t:
            vert_factor = y / fade_t
        elif y > (target_h - fade_b):
            vert_factor = max(0.0, (target_h - y) / fade_b)
            
        for x in range(target_w):
            if x < (edge_x - feather_w):
                alpha = 0.0
            elif x < edge_x:
                dist = edge_x - x
                alpha = 1.0 - (dist / feather_w)
            else:
                alpha = 1.0
            final_a = int(255 * alpha * vert_factor)
            mask.putpixel((x, y), final_a)
            
    rgba = port_res.convert('RGBA')
    rgba.putalpha(mask)
    return rgba

print("Helper functions compiled.")

def build_master_still(w=1920, h=1080):
    stage = make_stage(w, h).convert('RGBA')
    
    # 1. Glass shield
    glass = render_slanted_glass(w, h, cx=int(w * 0.68), cy=int(h * 0.45), gw=int(w * 0.44), gh=int(h * 0.58), angle_deg=14.5, radius=120)
    stage = Image.alpha_composite(stage, glass)
    
    # 2. Light streak
    p0 = (int(w * 0.08), int(h * 0.88))
    p1 = (int(w * 0.38), int(h * 0.72))
    p2 = (int(w * 0.62), int(h * 0.54))
    p3 = (int(w * 0.92), int(h * 0.32))
    streak = render_luminous_streak(w, h, p0, p1, p2, p3, width_base=75, intensity=1.1)
    stage = Image.alpha_composite(stage, streak)
    
    # 3. Portrait Cutout
    port_path = 'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg'
    target_h = int(h * 0.96)
    cutout = isolate_portrait(port_path, target_h)
    cw, ch = cutout.size
    
    # Position portrait on right
    px = int(w * 0.63)
    py = int(h * 0.04)
    stage.paste(cutout, (px, py), cutout)
    
    # 4. Bottom obsidian ground vignette
    vignette = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    v_start = int(h * 0.82)
    for y in range(v_start, h):
        t = (y - v_start) / float(h - v_start)
        alpha = int(255 * (t ** 1.5))
        vdraw.line([(0, y), (w, y)], fill=(6, 7, 10, alpha))
    stage = Image.alpha_composite(stage, vignette)
    
    return stage

out = build_master_still(1920, 1080)
out.save('media-workspace/gate_a_master_test.png')
print("Gate A Master test rendered successfully.")
