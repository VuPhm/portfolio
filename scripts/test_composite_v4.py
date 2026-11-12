import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10)

def create_ambient_stage(w, h):
    base = Image.new('RGB', (w, h), OBSIDIAN)
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    steps = 45
    cx, cy, radius = 1320, 520, 720
    for i in range(steps, 0, -1):
        r = int(radius * (i / steps))
        val = int(16 * (1.0 - (i / steps) ** 1.5))
        glow_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(int(val*0.9), int(val*0.95), val))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=80))
    return ImageChops.add(base, glow)

def render_glass_panel(w, h, box, radius=130):
    scale = 2
    sw, sh = w * scale, h * scale
    x0, y0, x1, y1 = [int(v * scale) for v in box]
    rad = int(radius * scale)
    
    layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # Translucent smoky glass
    draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=(16, 20, 30, 95))
    
    # Internal soft glass refraction
    inner = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    inner_draw = ImageDraw.Draw(inner)
    inner_draw.rounded_rectangle([x0+4, y0+4, x1-4, y1-4], radius=rad-4, fill=(45, 60, 85, 30))
    inner = inner.filter(ImageFilter.GaussianBlur(radius=20 * scale))
    layer = Image.alpha_composite(layer, inner)
    
    # Specular rim highlight
    rim = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, outline=(225, 238, 255, 220), width=int(1.8 * scale))
    
    mask = Image.new('L', (sw, sh), 0)
    mask_draw = ImageDraw.Draw(mask)
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        # Specular glint on upper half of glass
        val = int(255 * max(0.0, 1.0 - (t * 1.3) ** 1.2))
        mask_draw.line([(x0 - 20, y), (x1 + 20, y)], fill=val)
        
    rim.putalpha(ImageChops.multiply(rim.split()[3], mask))
    rim_soft = rim.filter(ImageFilter.GaussianBlur(radius=1.8 * scale))
    
    combined = Image.alpha_composite(layer, rim_soft)
    combined = Image.alpha_composite(combined, rim)
    return combined.resize((w, h), Image.Resampling.LANCZOS)

def create_curved_light_streak(w, h):
    """
    Renders the exact sweeping upward curve from 01-hero-visual-direction:
    Starts at (150, 920), arcs smoothly through (700, 780), (1050, 620), to (1720, 380).
    """
    scale = 2
    sw, sh = w * scale, h * scale
    
    # Cubic Bezier points
    p0 = (int(160 * scale), int(940 * scale))
    p1 = (int(720 * scale), int(820 * scale))
    p2 = (int(1080 * scale), int(640 * scale))
    p3 = (int(1780 * scale), int(360 * scale))
    
    steps = 200
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
        alpha = int(52 * taper)
        glow_draw.line([pts[i], pts[i+1]], fill=(215, 230, 252, alpha), width=int(80 * scale))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=36 * scale))
    
    core = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(175 * taper)
        core_draw.line([pts[i], pts[i+1]], fill=(245, 250, 255, alpha), width=int(3 * scale))
    core = core.filter(ImageFilter.GaussianBlur(radius=2.5 * scale))
    
    streak_hi = Image.alpha_composite(glow, core)
    return streak_hi.resize((w, h), Image.Resampling.LANCZOS)

def blend_portrait_onto_stage(stage, port_path, target_h=1040, pos_x=1020, pos_y=40):
    port = Image.open(port_path).convert('RGB')
    pw, ph = port.size
    target_w = int(pw * (target_h / float(ph)))
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    mask = Image.new('L', (target_w, target_h), 255)
    fade_l, fade_b, fade_t, fade_r = 90, 100, 30, 30
    for y in range(target_h):
        for x in range(target_w):
            f_l = 1.0 if x >= fade_l else (0.5 - 0.5 * math.cos((x / fade_l) * math.pi))
            r_from_right = target_w - 1 - x
            f_r = 1.0 if r_from_right >= fade_r else (0.5 - 0.5 * math.cos((r_from_right / fade_r) * math.pi))
            y_from_b = target_h - 1 - y
            f_b = 1.0 if y_from_b >= fade_b else (0.5 - 0.5 * math.cos((y_from_b / fade_b) * math.pi))
            f_t = 1.0 if y >= fade_t else (0.5 - 0.5 * math.cos((y / fade_t) * math.pi))
            val = int(f_l * f_r * f_b * f_t * 255)
            mask.putpixel((x, y), val)
            
    port_rgba = port_res.convert('RGBA')
    port_rgba.putalpha(mask)
    stage.paste(port_rgba, (pos_x, pos_y), port_rgba)
    return stage

if __name__ == '__main__':
    w, h = 1920, 1080
    stage = create_ambient_stage(w, h).convert('RGBA')
    
    # 1. Glass Panel
    glass = render_glass_panel(w, h, (920, 150, 1840, 930), radius=130)
    stage = Image.alpha_composite(stage, glass)
    
    # 2. Light Streak
    streak = create_curved_light_streak(w, h)
    stage = Image.alpha_composite(stage, streak)
    
    # 3. Portrait
    stage = blend_portrait_onto_stage(
        stage,
        'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg',
        target_h=1040,
        pos_x=1020,
        pos_y=40
    )
    
    stage.convert('RGB').save('media-workspace/test_composite_v4.png', quality=95)
    print("Test composite v4 created successfully.")
