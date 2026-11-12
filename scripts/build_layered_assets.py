import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10)

def create_ambient_stage(w, h, cx, cy, radius, intensity=16):
    base = Image.new('RGB', (w, h), OBSIDIAN)
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    steps = 45
    for i in range(steps, 0, -1):
        r = int(radius * (i / steps))
        val = int(intensity * (1.0 - (i / steps) ** 1.5))
        glow_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(int(val*0.9), int(val*0.95), val))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius * 0.12))
    return ImageChops.add(base, glow)

def render_glass_panel(w, h, box, radius=130):
    scale = 2
    sw, sh = w * scale, h * scale
    x0, y0, x1, y1 = [int(v * scale) for v in box]
    rad = int(radius * scale)
    
    layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # Translucent smoky obsidian glass
    draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=(16, 20, 30, 95))
    
    # Internal soft glass refraction
    inner = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    inner_draw = ImageDraw.Draw(inner)
    inner_draw.rounded_rectangle([x0+4, y0+4, x1-4, y1-4], radius=rad-4, fill=(45, 60, 85, 30))
    inner = inner.filter(ImageFilter.GaussianBlur(radius=20 * scale))
    layer = Image.alpha_composite(layer, inner)
    
    # Specular rim highlight on top edge and curves
    rim = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, outline=(225, 238, 255, 220), width=int(1.8 * scale))
    
    mask = Image.new('L', (sw, sh), 0)
    mask_draw = ImageDraw.Draw(mask)
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        val = int(255 * max(0.0, 1.0 - (t * 1.3) ** 1.2))
        mask_draw.line([(x0 - 20, y), (x1 + 20, y)], fill=val)
        
    rim.putalpha(ImageChops.multiply(rim.split()[3], mask))
    rim_soft = rim.filter(ImageFilter.GaussianBlur(radius=1.8 * scale))
    
    combined = Image.alpha_composite(layer, rim_soft)
    combined = Image.alpha_composite(combined, rim)
    return combined.resize((w, h), Image.Resampling.LANCZOS)

def create_desktop_streak(w, h):
    scale = 2
    sw, sh = w * scale, h * scale
    
    p0 = (int(160 * scale), int(940 * scale))
    p1 = (int(720 * scale), int(820 * scale))
    p2 = (int(1120 * scale), int(640 * scale))
    p3 = (int(1800 * scale), int(360 * scale))
    
    steps = 220
    pts = []
    for i in range(steps + 1):
        t = i / float(steps)
        bx = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
        by = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
        pts.append((bx, by))
        
    glow = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(58 * taper)
        glow_draw.line([pts[i], pts[i+1]], fill=(215, 230, 252, alpha), width=int(85 * scale))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=38 * scale))
    
    core = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(185 * taper)
        core_draw.line([pts[i], pts[i+1]], fill=(245, 250, 255, alpha), width=int(3.2 * scale))
    core = core.filter(ImageFilter.GaussianBlur(radius=2.6 * scale))
    
    streak_hi = Image.alpha_composite(glow, core)
    return streak_hi.resize((w, h), Image.Resampling.LANCZOS)

def create_precise_portrait_cutout(port_path, canvas_w, canvas_h, target_h, pos_x, pos_y):
    port = Image.open(port_path).convert('RGB')
    pw, ph = port.size
    target_w = int(pw * (target_h / float(ph)))
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # 1. Detect left edge contour and right edge contour
    face_left = []
    face_right = []
    for y in range(target_h):
        found_l = target_w
        for x in range(target_w // 2):
            r, g, b = port_res.getpixel((x, y))
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 9.5:
                found_l = x
                break
        face_left.append(found_l)
        
        found_r = 0
        for x in range(target_w - 1, target_w // 2, -1):
            r, g, b = port_res.getpixel((x, y))
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 9.5:
                found_r = x
                break
        face_right.append(found_r)
        
    smooth_left = []
    smooth_right = []
    k = 5
    for y in range(target_h):
        y_min = max(0, y - k)
        y_max = min(target_h, y + k + 1)
        smooth_left.append(sum(face_left[y_min:y_max]) / float(y_max - y_min))
        smooth_right.append(sum(face_right[y_min:y_max]) / float(y_max - y_min))
        
    mask = Image.new('L', (target_w, target_h), 0)
    feather_w = 26.0
    fade_b = 100.0
    fade_t = 30.0
    
    for y in range(target_h):
        edge_l = smooth_left[y]
        edge_r = smooth_right[y]
        y_from_b = target_h - 1 - y
        f_b = 1.0 if y_from_b >= fade_b else (0.5 - 0.5 * math.cos((y_from_b / fade_b) * math.pi))
        f_t = 1.0 if y >= fade_t else (0.5 - 0.5 * math.cos((y / fade_t) * math.pi))
        
        for x in range(target_w):
            # Left contour ramp
            dist_l = x - (edge_l - 12.0)
            if dist_l <= 0:
                f_l = 0.0
            elif dist_l >= feather_w:
                f_l = 1.0
            else:
                t = dist_l / feather_w
                f_l = 0.5 - 0.5 * math.cos(t * math.pi)
                
            # Right contour ramp
            if edge_r > 0:
                dist_r = (edge_r + 14.0) - x
                if dist_r <= 0:
                    f_r = 0.0
                elif dist_r >= feather_w:
                    f_r = 1.0
                else:
                    t = dist_r / feather_w
                    f_r = 0.5 - 0.5 * math.cos(t * math.pi)
            else:
                f_r = 0.0
                
            val = int(f_l * f_r * f_b * f_t * 255)
            mask.putpixel((x, y), val)
            
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.2))
    port_rgba = port_res.convert('RGBA')
    port_rgba.putalpha(mask)
    
    cutout_canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    cutout_canvas.paste(port_rgba, (pos_x, pos_y), port_rgba)
    return cutout_canvas

def create_mobile_streak(w, h):
    scale = 2
    sw, sh = w * scale, h * scale
    p0 = (int(60 * scale), int(1060 * scale))
    p1 = (int(380 * scale), int(980 * scale))
    p2 = (int(680 * scale), int(840 * scale))
    p3 = (int(1020 * scale), int(640 * scale))
    
    steps = 180
    pts = []
    for i in range(steps + 1):
        t = i / float(steps)
        bx = (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0]
        by = (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
        pts.append((bx, by))
        
    glow = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(50 * taper)
        glow_draw.line([pts[i], pts[i+1]], fill=(215, 230, 252, alpha), width=int(65 * scale))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=28 * scale))
    
    core = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(160 * taper)
        core_draw.line([pts[i], pts[i+1]], fill=(245, 250, 255, alpha), width=int(2.4 * scale))
    core = core.filter(ImageFilter.GaussianBlur(radius=2.0 * scale))
    
    streak_hi = Image.alpha_composite(glow, core)
    return streak_hi.resize((w, h), Image.Resampling.LANCZOS)

def create_mobile_figure(port_path, canvas_w=1080, canvas_h=1920):
    port = Image.open(port_path).convert('RGB')
    pw, ph = port.size
    target_w = 880
    target_h = int(ph * (target_w / float(pw)))
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    pos_x = (canvas_w - target_w) // 2 + 30
    pos_y = 100
    
    mask = Image.new('L', (target_w, target_h), 255)
    fade_b = 160.0
    fade_t = 30.0
    fade_side = 70.0
    
    for y in range(target_h):
        y_from_b = target_h - 1 - y
        f_b = 1.0 if y_from_b >= fade_b else (0.5 - 0.5 * math.cos((y_from_b / fade_b) * math.pi))
        f_t = 1.0 if y >= fade_t else (0.5 - 0.5 * math.cos((y / fade_t) * math.pi))
        for x in range(target_w):
            f_l = 1.0 if x >= fade_side else (0.5 - 0.5 * math.cos((x / fade_side) * math.pi))
            r_from_r = target_w - 1 - x
            f_r = 1.0 if r_from_r >= fade_side else (0.5 - 0.5 * math.cos((r_from_r / fade_side) * math.pi))
            val = int(f_b * f_t * f_l * f_r * 255)
            mask.putpixel((x, y), val)
            
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.5))
    port_rgba = port_res.convert('RGBA')
    port_rgba.putalpha(mask)
    
    cutout = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    cutout.paste(port_rgba, (pos_x, pos_y), port_rgba)
    return cutout

if __name__ == '__main__':
    os.makedirs('public/hero', exist_ok=True)
    
    # ----------------- DESKTOP 1920x1080 -----------------
    dw, dh = 1920, 1080
    print("Building desktop layers...")
    bg_desk = create_ambient_stage(dw, dh, cx=1320, cy=520, radius=720, intensity=16)
    bg_desk.save('public/hero/hero-stage-bg-desktop.webp', quality=92, method=6)
    
    glass_desk = render_glass_panel(dw, dh, (920, 150, 1840, 930), radius=130)
    glass_desk.save('public/hero/hero-glass-desktop.webp', quality=94, method=6)
    
    streak_desk = create_desktop_streak(dw, dh)
    streak_desk.save('public/hero/hero-streak-desktop.webp', quality=94, method=6)
    
    # Variant B Figure & Master Poster
    fig_b_desk = create_precise_portrait_cutout(
        'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg',
        canvas_w=dw, canvas_h=dh, target_h=1040, pos_x=1020, pos_y=40
    )
    fig_b_desk.save('public/hero/hero-figure-b-desktop.webp', quality=94, method=6)
    
    master_b_desk = bg_desk.convert('RGBA')
    master_b_desk = Image.alpha_composite(master_b_desk, glass_desk)
    master_b_desk = Image.alpha_composite(master_b_desk, streak_desk)
    master_b_desk = Image.alpha_composite(master_b_desk, fig_b_desk)
    master_b_desk.convert('RGB').save('public/hero/hero-portrait-b-desktop.webp', quality=94, method=6)
    
    # Variant A Figure & Master Poster
    fig_a_desk = create_precise_portrait_cutout(
        'media-workspace/portrait-session-03/final_variant_a_narrow_light.jpg',
        canvas_w=dw, canvas_h=dh, target_h=1040, pos_x=1020, pos_y=40
    )
    fig_a_desk.save('public/hero/hero-figure-a-desktop.webp', quality=94, method=6)
    
    master_a_desk = bg_desk.convert('RGBA')
    master_a_desk = Image.alpha_composite(master_a_desk, glass_desk)
    master_a_desk = Image.alpha_composite(master_a_desk, streak_desk)
    master_a_desk = Image.alpha_composite(master_a_desk, fig_a_desk)
    master_a_desk.convert('RGB').save('public/hero/hero-portrait-a-desktop.webp', quality=94, method=6)
    
    # ----------------- MOBILE 1080x1920 -----------------
    mw, mh = 1080, 1920
    print("Building mobile layers...")
    bg_mobi = create_ambient_stage(mw, mh, cx=540, cy=580, radius=520, intensity=18)
    bg_mobi.save('public/hero/hero-stage-bg-mobile.webp', quality=92, method=6)
    
    glass_mobi = render_glass_panel(mw, mh, (160, 180, 960, 1020), radius=90)
    glass_mobi.save('public/hero/hero-glass-mobile.webp', quality=94, method=6)
    
    streak_mobi = create_mobile_streak(mw, mh)
    streak_mobi.save('public/hero/hero-streak-mobile.webp', quality=94, method=6)
    
    fig_b_mobi = create_mobile_figure('media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg', mw, mh)
    fig_b_mobi.save('public/hero/hero-figure-b-mobile.webp', quality=94, method=6)
    
    master_b_mobi = bg_mobi.convert('RGBA')
    master_b_mobi = Image.alpha_composite(master_b_mobi, glass_mobi)
    master_b_mobi = Image.alpha_composite(master_b_mobi, streak_mobi)
    master_b_mobi = Image.alpha_composite(master_b_mobi, fig_b_mobi)
    
    # Solid obsidian floor for mobile typography (y > 1180)
    floor = Image.new('RGBA', (mw, mh), (6, 7, 10, 0))
    floor_draw = ImageDraw.Draw(floor)
    for y in range(1060, 1220):
        t = (y - 1060) / 160.0
        val = int((0.5 - 0.5 * math.cos(t * math.pi)) * 255)
        floor_draw.line([(0, y), (mw, y)], fill=(6, 7, 10, val))
    floor_draw.rectangle([0, 1220, mw, mh], fill=(6, 7, 10, 255))
    master_b_mobi = Image.alpha_composite(master_b_mobi, floor)
    master_b_mobi.convert('RGB').save('public/hero/hero-portrait-b-mobile.webp', quality=94, method=6)
    
    fig_a_mobi = create_mobile_figure('media-workspace/portrait-session-03/final_variant_a_narrow_light.jpg', mw, mh)
    fig_a_mobi.save('public/hero/hero-figure-a-mobile.webp', quality=94, method=6)
    master_a_mobi = bg_mobi.convert('RGBA')
    master_a_mobi = Image.alpha_composite(master_a_mobi, glass_mobi)
    master_a_mobi = Image.alpha_composite(master_a_mobi, streak_mobi)
    master_a_mobi = Image.alpha_composite(master_a_mobi, fig_a_mobi)
    master_a_mobi = Image.alpha_composite(master_a_mobi, floor)
    master_a_mobi.convert('RGB').save('public/hero/hero-portrait-a-mobile.webp', quality=94, method=6)
    
    print("✓ All layered assets generated successfully.")
