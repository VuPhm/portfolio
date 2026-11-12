import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OBSIDIAN = (6, 7, 10)

def test():
    dw, dh = 1920, 1080
    bg = Image.new('RGB', (dw, dh), OBSIDIAN)
    
    # Render glass
    scale = 2
    sw, sh = dw * scale, dh * scale
    x0, y0, x1, y1 = int(920 * scale), int(150 * scale), int(1840 * scale), int(930 * scale)
    rad = int(130 * scale)
    glass = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glass)
    gdraw.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=(16, 20, 30, 95))
    
    inner = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(inner)
    idraw.rounded_rectangle([x0+4, y0+4, x1-4, y1-4], radius=rad-4, fill=(45, 60, 85, 30))
    inner = inner.filter(ImageFilter.GaussianBlur(radius=20 * scale))
    glass = Image.alpha_composite(glass, inner)
    
    rim = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rim)
    rdraw.rounded_rectangle([x0, y0, x1, y1], radius=rad, outline=(225, 238, 255, 220), width=int(1.8 * scale))
    mask = Image.new('L', (sw, sh), 0)
    mdraw = ImageDraw.Draw(mask)
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        val = int(255 * max(0.0, 1.0 - (t * 1.3) ** 1.2))
        mdraw.line([(x0 - 20, y), (x1 + 20, y)], fill=val)
    rim.putalpha(ImageChops.multiply(rim.split()[3], mask))
    rim_soft = rim.filter(ImageFilter.GaussianBlur(radius=1.8 * scale))
    glass = Image.alpha_composite(glass, rim_soft)
    glass = Image.alpha_composite(glass, rim)
    glass = glass.resize((dw, dh), Image.Resampling.LANCZOS)
    
    # Render streak
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
    gldraw = ImageDraw.Draw(glow)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        gldraw.line([pts[i], pts[i+1]], fill=(215, 230, 252, int(58 * taper)), width=int(85 * scale))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=38 * scale))
    core = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(core)
    for i in range(len(pts) - 1):
        t = i / float(steps)
        taper = math.sin(t * math.pi)
        cdraw.line([pts[i], pts[i+1]], fill=(245, 250, 255, int(185 * taper)), width=int(3.2 * scale))
    core = core.filter(ImageFilter.GaussianBlur(radius=2.6 * scale))
    streak = Image.alpha_composite(glow, core).resize((dw, dh), Image.Resampling.LANCZOS)
    
    # Portrait: size target_h = 1060
    port = Image.open('media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg').convert('RGB')
    pw, ph = port.size
    target_h = 1060
    target_w = int(pw * (target_h / float(ph))) # 896 * (1060/1200) ≈ 791
    port_res = port.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Left contour only
    face_left = []
    for y in range(target_h):
        found_l = target_w
        for x in range(target_w // 2):
            r, g, b = port_res.getpixel((x, y))
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 9.5:
                found_l = x
                break
        face_left.append(found_l)
        
    smooth_left = []
    k = 5
    for y in range(target_h):
        y_min = max(0, y - k)
        y_max = min(target_h, y + k + 1)
        smooth_left.append(sum(face_left[y_min:y_max]) / float(y_max - y_min))
        
    pmask = Image.new('L', (target_w, target_h), 255)
    feather_w = 26.0
    fade_b = 100.0
    fade_t = 25.0
    fade_r = 45.0
    
    for y in range(target_h):
        edge_l = smooth_left[y]
        y_from_b = target_h - 1 - y
        f_b = 1.0 if y_from_b >= fade_b else (0.5 - 0.5 * math.cos((y_from_b / fade_b) * math.pi))
        f_t = 1.0 if y >= fade_t else (0.5 - 0.5 * math.cos((y / fade_t) * math.pi))
        
        for x in range(target_w):
            r_from_r = target_w - 1 - x
            f_r = 1.0 if r_from_r >= fade_r else (0.5 - 0.5 * math.cos((r_from_r / fade_r) * math.pi))
            
            dist_l = x - (edge_l - 12.0)
            if dist_l <= 0:
                f_l = 0.0
            elif dist_l >= feather_w:
                f_l = 1.0
            else:
                t = dist_l / feather_w
                f_l = 0.5 - 0.5 * math.cos(t * math.pi)
                
            val = int(f_l * f_b * f_t * f_r * 255)
            pmask.putpixel((x, y), val)
            
    pmask = pmask.filter(ImageFilter.GaussianBlur(radius=1.2))
    port_rgba = port_res.convert('RGBA')
    port_rgba.putalpha(pmask)
    
    # Position: pos_x = 1920 - target_w + 10 (flush against right edge!)
    pos_x = dw - target_w
    pos_y = 20
    
    stage = bg.convert('RGBA')
    stage = Image.alpha_composite(stage, glass)
    stage = Image.alpha_composite(stage, streak)
    stage.paste(port_rgba, (pos_x, pos_y), port_rgba)
    stage.convert('RGB').save('media-workspace/test_seamless_v6.png', quality=95)
    print("Test seamless v6 created successfully.")

if __name__ == '__main__':
    test()
