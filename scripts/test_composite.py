import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10)

def create_ambient_stage(w, h):
    base = Image.new('RGB', (w, h), OBSIDIAN)
    # Very subtle ambient stage glow behind character
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    steps = 40
    cx, cy, radius = 1380, 540, 650
    for i in range(steps, 0, -1):
        r = int(radius * (i / steps))
        val = int(14 * (1.0 - (i / steps) ** 1.6))
        glow_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(int(val*0.9), int(val*0.95), val))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=80))
    return ImageChops.add(base, glow)

def render_glass_panel(w, h, box, radius=85):
    scale = 2
    sw, sh = w * scale, h * scale
    x0, y0, x1, y1 = [int(v * scale) for v in box]
    rad = int(radius * scale)
    
    layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=(15, 18, 26, 110))
    
    # Internal soft gradient / refraction
    inner = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    inner_draw = ImageDraw.Draw(inner)
    inner_draw.rounded_rectangle([x0+4, y0+4, x1-4, y1-4], radius=rad-4, fill=(45, 58, 78, 30))
    inner = inner.filter(ImageFilter.GaussianBlur(radius=16 * scale))
    layer = Image.alpha_composite(layer, inner)
    
    # Polished specular rim highlight on top and curved corners
    rim = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, outline=(225, 238, 255, 210), width=int(1.8 * scale))
    
    mask = Image.new('L', (sw, sh), 0)
    mask_draw = ImageDraw.Draw(mask)
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        val = int(255 * max(0.0, 1.0 - t * 1.5))
        mask_draw.line([(x0 - 10, y), (x1 + 10, y)], fill=val)
        
    rim.putalpha(ImageChops.multiply(rim.split()[3], mask))
    rim_soft = rim.filter(ImageFilter.GaussianBlur(radius=1.5 * scale))
    
    combined = Image.alpha_composite(layer, rim_soft)
    combined = Image.alpha_composite(combined, rim)
    return combined.resize((w, h), Image.Resampling.LANCZOS)

def create_light_streak(w, h, start_pt, mid_pt, end_pt, core_thickness=3, glow_width=70):
    steps = 140
    pts = []
    x0, y0 = start_pt
    x1, y1 = mid_pt
    x2, y2 = end_pt
    for i in range(steps + 1):
        t = i / float(steps)
        bx = (1 - t)**2 * x0 + 2 * (1 - t) * t * x1 + t**2 * x2
        by = (1 - t)**2 * y0 + 2 * (1 - t) * t * y1 + t**2 * y2
        pts.append((bx, by))
        
    # Wide atmospheric aura along streak
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(55 * taper)
        glow_draw.line([pts[i], pts[i+1]], fill=(215, 228, 248, alpha), width=glow_width)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=glow_width * 0.45))
    
    # Sharp luminous core beam
    core = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        alpha = int(165 * taper)
        core_draw.line([pts[i], pts[i+1]], fill=(245, 250, 255, alpha), width=core_thickness)
    core = core.filter(ImageFilter.GaussianBlur(radius=core_thickness * 1.0))
    
    return Image.alpha_composite(glow, core)

def blend_portrait_onto_stage(stage, port_path, target_h=1000, pos_x=1080, pos_y=80):
    port = Image.open(port_path).convert('RGB')
    pw, ph = port.size
    target_w = int(pw * (target_h / float(ph)))
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Create smooth bounding-box feather mask
    # Left edge: 90px cosine fade into stage
    # Bottom edge: 100px cosine fade into stage
    # Top edge: 30px fade
    # Right edge: 30px fade
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
            
            # Note: inside the subject, hair & face stay 100% opaque!
            # Only near the borders does it smoothly feather.
            val = int(f_l * f_r * f_b * f_t * 255)
            mask.putpixel((x, y), val)
            
    port_rgba = port_res.convert('RGBA')
    port_rgba.putalpha(mask)
    
    # Paste onto stage
    stage.paste(port_rgba, (pos_x, pos_y), port_rgba)
    return stage

if __name__ == '__main__':
    w, h = 1920, 1080
    stage = create_ambient_stage(w, h).convert('RGBA')
    
    # 1. Glass Panel behind character
    glass = render_glass_panel(w, h, (920, 150, 1840, 930), radius=90)
    stage = Image.alpha_composite(stage, glass)
    
    # 2. Light Streak curving from left to behind character
    streak = create_light_streak(
        w, h,
        start_pt=(180, 820),
        mid_pt=(980, 680),
        end_pt=(1750, 520),
        core_thickness=3,
        glow_width=75
    )
    stage = Image.alpha_composite(stage, streak)
    
    # 3. Portrait: Variant B with 100% solid hair and skin
    stage = blend_portrait_onto_stage(
        stage,
        'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg',
        target_h=1020,
        pos_x=1100,
        pos_y=60
    )
    
    stage.convert('RGB').save('media-workspace/test_composite_v3.png', quality=95)
    print("Test composite v3 created successfully.")
