import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

def render_glass_panel(w, h, box, radius=80):
    """
    Renders an Apple-inspired floating dark smoke glass shield
    with specular rim highlights and subtle refraction.
    """
    scale = 2
    sw, sh = w * scale, h * scale
    x0, y0, x1, y1 = [int(v * scale) for v in box]
    rad = int(radius * scale)
    
    # Base glass fill: translucent dark obsidian
    layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    
    # Fill with deep tinted glass
    draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=(16, 20, 28, 90))
    
    # Internal soft gradient / refraction
    inner_glow = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    inner_draw = ImageDraw.Draw(inner_glow)
    inner_draw.rounded_rectangle([x0+4, y0+4, x1-4, y1-4], radius=rad-4, fill=(40, 52, 70, 35))
    inner_glow = inner_glow.filter(ImageFilter.GaussianBlur(radius=12 * scale))
    layer = Image.alpha_composite(layer, inner_glow)
    
    # Polished specular rim highlight on top and side curves
    rim = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    # Outer stroke
    rim_draw.rounded_rectangle([x0, y0, x1, y1], radius=rad, outline=(220, 235, 255, 180), width=int(1.5 * scale))
    
    # Mask to keep rim highlight mostly on top-left curve, top edge, and right curve
    mask = Image.new('L', (sw, sh), 0)
    mask_draw = ImageDraw.Draw(mask)
    # Linear gradient vertically across the panel height
    for y in range(y0, y1):
        t = (y - y0) / float(y1 - y0)
        # Highlight strong at top (t < 0.3), soft on sides, fading out at bottom
        val = int(255 * max(0.0, 1.0 - t * 1.4))
        mask_draw.line([(x0 - 10, y), (x1 + 10, y)], fill=val)
    
    rim.putalpha(ImageChops.multiply(rim.split()[3], mask))
    rim_soft = rim.filter(ImageFilter.GaussianBlur(radius=1.2 * scale))
    
    combined = Image.alpha_composite(layer, rim_soft)
    combined = Image.alpha_composite(combined, rim)
    
    return combined.resize((w, h), Image.Resampling.LANCZOS)

if __name__ == '__main__':
    w, h = 1920, 1080
    # Box per 01-hero-visual-direction: from x ≈ 920 to 1840, y ≈ 150 to 920
    glass = render_glass_panel(w, h, (900, 140, 1840, 930), radius=90)
    glass.save('media-workspace/test_glass.png')
    print("Glass panel rendered successfully.")
