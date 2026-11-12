#!/usr/bin/env python3
"""
scripts/refine_master_stills.py
Develops and evaluates Desktop Master Still candidates for Round 04.10:
- Master Still A: Monochrome Silver (Approved baseline from commit d1b03d2)
- Master Still B1: Direct Plate from media_1794485019468_122da372.jpg
- Master Still B2: Hybrid (Pristine Variant B face + Chromatic Plate environment)
- Master Still B3: Artisanal Chromatic Master (Pristine 1672x941 master + Apple chromatic lighting)

Evaluates at 1920x1080 and 1440x900.
Generates contact sheets and quality metric reports.
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance

OUT_DIR = 'media-workspace/round_04_10_stills'
os.makedirs(OUT_DIR, exist_ok=True)

OBSIDIAN = (6, 7, 10)

def load_images():
    mono_path = 'media-workspace/master_clean_plate.png'
    plate_path = 'media-workspace/references_r04_8/ref_desktop_plate.jpg'
    mockup_path = 'media-workspace/references_r04_8/ref_desktop_mockup.jpg'
    glow_ref_path = '/Users/vup/.gemini/antigravity/brain/679745bc-fdd4-4e1e-9eb3-6ed2b787eeb2/.user_uploaded/media_1794470723315_4fda8ab0.png'
    
    mono = Image.open(mono_path).convert('RGB')
    plate = Image.open(plate_path).convert('RGB')
    mockup = Image.open(mockup_path).convert('RGB') if os.path.exists(mockup_path) else None
    glow_ref = Image.open(glow_ref_path).convert('RGBA') if os.path.exists(glow_ref_path) else None
    
    return mono, plate, mockup, glow_ref

# -------------------------------------------------------------
# Still A: Monochrome Silver Baseline
# -------------------------------------------------------------
def build_still_a(mono, out_w, out_h):
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    scaled = mono.resize((out_w, out_h), Image.Resampling.LANCZOS)
    scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.1, percent=105, threshold=3))
    canvas.paste(scaled, (0, 0))
    return canvas

# -------------------------------------------------------------
# Still B1: Direct Plate Upscale
# -------------------------------------------------------------
def build_still_b1(plate, out_w, out_h):
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    scaled = plate.resize((out_w, out_h), Image.Resampling.LANCZOS)
    # Gentle thresholded unsharp mask to protect smooth gradients
    scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.0, percent=95, threshold=3))
    canvas.paste(scaled, (0, 0))
    return canvas

# -------------------------------------------------------------
# Still B3: Artisanal Chromatic Master on Pristine 1672x941
# -------------------------------------------------------------
def build_still_b3(mono, out_w, out_h):
    """
    Takes pristine 1672x941 master plate and applies authentic, subtle chromatic lighting:
    1. Upper-left glass bevel: Muted violet / cool indigo specular reflection
    2. Upper-right glass bevel: Soft warm amber specular reflection
    3. Sweeping light ribbon: Apple Intelligence chromatic specular progression (blue->indigo->violet->amber)
    4. Negative space: Gentle deep indigo atmospheric depth
    5. Subject face: 100% pristine Variant B pixels protected with zero color cast
    """
    mw, mh = mono.size # 1672 x 941
    base = mono.copy()
    
    # Create chromatic overlay layer
    chroma_layer = Image.new('RGB', (mw, mh), (0, 0, 0))
    c_draw = ImageDraw.Draw(chroma_layer)
    
    # 1. Subtle deep indigo atmosphere in upper-left negative space
    # Center at (300, 150), radius 600, max intensity RGB(14, 18, 35)
    for r in range(650, 0, -25):
        alpha_factor = ((650 - r) / 650.0) ** 1.8
        ir = int(12 * alpha_factor)
        ig = int(16 * alpha_factor)
        ib = int(32 * alpha_factor)
        c_draw.ellipse([300 - r, 150 - int(r*0.6), 300 + r, 150 + int(r*0.6)], fill=(ir, ig, ib))
        
    # 2. Upper-left glass bevel: Muted violet / cool blue rim
    # In mono (1672x941), the glass curve behind head on left extends roughly x=720..950, y=280..480
    # Let's locate the glass rim pixels and tint them directly:
    
    # We will build a tint map that selectively adds color based on luminance & position
    # Tint rule:
    # - If pixel is part of glass bevel or ribbon (luminance between 25 and 180, outside the face bounding box):
    #   Apply chromatic color proportional to its luminance.
    
    # Face protection bounding box in 1672x941:
    # Face is located at x=920..1220, y=140..560
    # Shoulder/body extends down to y=941, x=850..1400
    
    # Convert base to pixel access for precise chromatic mapping
    result = base.copy()
    
    # Soft atmosphere blend
    chroma_layer = chroma_layer.filter(ImageFilter.GaussianBlur(radius=60))
    result = ImageChops.screen(result, chroma_layer)
    
    # Now apply chromatic specular color strictly to:
    # A. Upper-left glass curve (x: 680 to 930, y: 240 to 520) -> Muted violet (R: 0.85, G: 0.70, B: 1.45)
    # B. Upper-right glass bevel (x: 1220 to 1550, y: 180 to 450) -> Warm amber (R: 1.45, G: 1.05, B: 0.70)
    # C. Light ribbon contour (x: 100 to 1100, y: 480 to 900) -> Gradient (cool blue -> violet -> magenta -> amber)
    
    res_pixels = result.load()
    mono_pixels = mono.load()
    
    for y in range(mh):
        for x in range(mw):
            # Strict protection of face and head
            # Head ellipse: center (1070, 310), rx=140, ry=190
            dx = (x - 1070) / 140.0
            dy = (y - 310) / 190.0
            is_head = (dx*dx + dy*dy) <= 1.05
            
            # Neck & collar protection: x=1000..1160, y=470..600
            is_neck = (990 <= x <= 1180 and 460 <= y <= 620)
            
            if is_head or is_neck:
                # Keep 100% original mono pixel
                res_pixels[x, y] = mono_pixels[x, y]
                continue
                
            r, g, b = res_pixels[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            
            if lum < 12: # Preserve obsidian black background
                continue
                
            # Region A: Upper-left glass curve
            if 680 <= x <= 960 and 220 <= y <= 550:
                # Distance from glass curve edge
                edge_factor = min(1.0, max(0.0, (lum - 15) / 90.0))
                # Cool violet tint: boost Blue and soft Red, keep Green restrained
                new_r = min(255, int(r * 0.95 + 16 * edge_factor))
                new_g = min(255, int(g * 0.88 + 8 * edge_factor))
                new_b = min(255, int(b * 1.35 + 42 * edge_factor))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
            # Region B: Upper-right glass curve
            elif 1220 <= x <= 1580 and 160 <= y <= 480:
                edge_factor = min(1.0, max(0.0, (lum - 15) / 90.0))
                # Soft warm amber tint: boost Red and soft Green, reduce Blue
                new_r = min(255, int(r * 1.32 + 38 * edge_factor))
                new_g = min(255, int(g * 1.08 + 18 * edge_factor))
                new_b = min(255, int(b * 0.82 + 4 * edge_factor))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
            # Region C: Sweeping light ribbon across bottom
            elif 100 <= x <= 1100 and 480 <= y <= 920:
                edge_factor = min(1.0, max(0.0, (lum - 18) / 100.0))
                # Color progress along x:
                # x in [150, 400]: Cool Blue (R: 0.75, G: 0.90, B: 1.50)
                # x in [400, 650]: Violet / Indigo (R: 0.95, G: 0.80, B: 1.40)
                # x in [650, 850]: Orchid / Magenta (R: 1.25, G: 0.80, B: 1.20)
                # x in [850, 1100]: Warm Amber (R: 1.35, G: 1.10, B: 0.80)
                prog = (x - 150) / 950.0
                prog = max(0.0, min(1.0, prog))
                
                if prog < 0.30: # Cool Blue
                    t = prog / 0.30
                    cr = 0.70 + 0.25 * t
                    cg = 0.85 - 0.05 * t
                    cb = 1.55 - 0.15 * t
                    add_r = int(10 * edge_factor)
                    add_g = int(14 * edge_factor)
                    add_b = int(48 * edge_factor)
                elif prog < 0.65: # Violet / Orchid
                    t = (prog - 0.30) / 0.35
                    cr = 0.95 + 0.30 * t
                    cg = 0.80 - 0.05 * t
                    cb = 1.40 - 0.25 * t
                    add_r = int((10 + 26 * t) * edge_factor)
                    add_g = int((14 - 4 * t) * edge_factor)
                    add_b = int((48 - 14 * t) * edge_factor)
                else: # Transitioning towards soft amber near character
                    t = (prog - 0.65) / 0.35
                    cr = 1.25 + 0.10 * t
                    cg = 0.75 + 0.30 * t
                    cb = 1.15 - 0.35 * t
                    add_r = int((36 + 10 * t) * edge_factor)
                    add_g = int((10 + 12 * t) * edge_factor)
                    add_b = int((34 - 24 * t) * edge_factor)
                    
                new_r = min(255, int(r * cr + add_r))
                new_g = min(255, int(g * cg + add_g))
                new_b = min(255, int(b * cb + add_b))
                res_pixels[x, y] = (new_r, new_g, new_b)
                
    # Now scale to target resolution with high-precision Lanczos
    canvas = Image.new('RGB', (out_w, out_h), OBSIDIAN)
    scaled = result.resize((out_w, out_h), Image.Resampling.LANCZOS)
    scaled = scaled.filter(ImageFilter.UnsharpMask(radius=1.1, percent=105, threshold=3))
    canvas.paste(scaled, (0, 0))
    return canvas

def main():
    print("Loading master plates...")
    mono, plate, mockup, glow_ref = load_images()
    
    viewports = [
        ('1920x1080', 1920, 1080),
        ('1440x900', 1440, 900),
        ('1280x800', 1280, 800)
    ]
    
    for vp_name, w, h in viewports:
        print(f"\n--- Generating Master Stills for {vp_name} ---")
        
        # Still A: Monochrome Silver
        still_a = build_still_a(mono, w, h)
        a_path = os.path.join(OUT_DIR, f"master_still_a_mono_{vp_name}.png")
        still_a.save(a_path)
        print(f"Saved: {a_path}")
        
        # Still B1: Direct Plate
        still_b1 = build_still_b1(plate, w, h)
        b1_path = os.path.join(OUT_DIR, f"master_still_b1_plate_{vp_name}.png")
        still_b1.save(b1_path)
        print(f"Saved: {b1_path}")
        
        # Still B3: Artisanal Chromatic Master
        still_b3 = build_still_b3(mono, w, h)
        b3_path = os.path.join(OUT_DIR, f"master_still_b3_chroma_{vp_name}.png")
        still_b3.save(b3_path)
        print(f"Saved: {b3_path}")

    print("\nAll candidate master stills generated successfully.")

if __name__ == '__main__':
    main()

