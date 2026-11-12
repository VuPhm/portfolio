#!/usr/bin/env python3
"""
Production Hero Composites Generator for VUPHM Portfolio.
Builds both Variant A (Narrow Light) and Variant B (Subtle Rim) for Desktop and Mobile.
Canvas sizes:
- Desktop: 1920 x 1080
- Mobile: 1080 x 1920
Aesthetic: Extreme Low-Key Obsidian Stage (#06070a) with Apple-inspired floating glass panels.
"""
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

def create_desktop_composite(portrait_path, output_path):
    bg_orig = Image.open('public/hero/hero-poster-desktop.webp').convert('RGB')
    w_orig, h_orig = bg_orig.size
    
    # Shift background left by 120 pixels to give right 1/3 ample obsidian negative space
    shift_x = 120
    bg_shifted = Image.new('RGB', (w_orig, h_orig), (6, 7, 10))
    bg_shifted.paste(bg_orig, (-shift_x, 0))
    bg = np.array(bg_shifted, dtype=np.float32)
    
    port = Image.open(portrait_path).convert('RGB')
    h, w, c = bg.shape
    obsidian = np.array([6, 7, 10], dtype=np.float32)
    
    # Smooth fade out right 3rd panel into obsidian
    fade_right = np.clip((np.arange(w) - 1050.0) / 220.0, 0.0, 1.0)
    fade_right = 0.5 - 0.5 * np.cos(fade_right * np.pi)
    
    # Moderate center panel contrast so it stays elegantly in the background
    center_weight = np.exp(-((np.arange(w) - (960.0 - shift_x)) ** 2) / (2 * (320.0 ** 2)))
    
    for ch in range(3):
        bg[:, :, ch] = bg[:, :, ch] * (1.0 - center_weight[None, :] * 0.30) + obsidian[ch] * (center_weight[None, :] * 0.30)
        bg[:, :, ch] = bg[:, :, ch] * (1.0 - fade_right[None, :]) + obsidian[ch] * fade_right[None, :]
        
    target_h = 1040
    target_w = int(port.size[0] * (target_h / float(port.size[1])))
    port_res = np.array(port.resize((target_w, target_h), Image.Resampling.LANCZOS), dtype=np.float32)
    
    pos_x = w - target_w - 20
    pos_y = h - target_h
    
    port_lum = 0.299 * port_res[:, :, 0] + 0.587 * port_res[:, :, 1] + 0.114 * port_res[:, :, 2]
    fg_alpha = np.clip((port_lum - 8.0) / 12.0, 0.0, 1.0)
    fg_alpha_smooth = gaussian_filter(fg_alpha, sigma=2.0)
    
    py, px = np.mgrid[0:target_h, 0:target_w]
    bottom_fade = np.clip((target_h - py) / 90.0, 0.0, 1.0)
    bottom_fade = 0.5 - 0.5 * np.cos(bottom_fade * np.pi)
    left_fade = np.clip(px / 120.0, 0.0, 1.0)
    left_fade = 0.5 - 0.5 * np.cos(left_fade * np.pi)
    
    final_alpha = np.clip(fg_alpha_smooth * bottom_fade * left_fade, 0.0, 1.0)
    
    out = bg.copy()
    for ch in range(3):
        bg_patch = out[pos_y:pos_y+target_h, pos_x:pos_x+target_w, ch]
        out[pos_y:pos_y+target_h, pos_x:pos_x+target_w, ch] = (
            port_res[:, :, ch] * final_alpha + bg_patch * (1.0 - final_alpha)
        )
        
    final_img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    final_img.save(output_path, quality=94, method=6)
    print(f"Saved {output_path}")

def create_mobile_composite(portrait_path, output_path):
    """
    Dedicated Mobile Composition (1080 x 1920, 9:16).
    - Top nav headroom: 0 - 150px.
    - Upper-middle (y: 120 to 1250): Solid head and natural rim light, centered with slight right offset.
    - Lower area (y > 1250): Pure obsidian black (#06070a) for crisp typography & CTAs.
    - Zero glass panel intersecting head/hair.
    """
    canvas_w, canvas_h = 1080, 1920
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.float32)
    canvas[:, :] = [6, 7, 10]
    
    # Subtle stage illumination behind
    y_grid, x_grid = np.mgrid[0:canvas_h, 0:canvas_w]
    stage_glow = np.exp(-((x_grid - 540) ** 2 + (y_grid - 700) ** 2) / (2 * (450 ** 2))) * 12.0
    for c in range(3):
        canvas[:, :, c] += stage_glow
        
    port = Image.open(portrait_path).convert('RGB')
    pw, ph = port.size
    target_w = 920
    target_h = int(ph * (target_w / float(pw)))
    port_res = np.array(port.resize((target_w, target_h), Image.Resampling.LANCZOS), dtype=np.float32)
    
    pos_x = (canvas_w - target_w) // 2 + 30
    pos_y = 120
    
    py, px = np.mgrid[0:target_h, 0:target_w]
    fade_left = np.clip(px / 80.0, 0.0, 1.0)
    fade_left = 0.5 - 0.5 * np.cos(fade_left * np.pi)
    fade_right = np.clip((target_w - px) / 80.0, 0.0, 1.0)
    fade_right = 0.5 - 0.5 * np.cos(fade_right * np.pi)
    fade_top = np.clip(py / 80.0, 0.0, 1.0)
    fade_top = 0.5 - 0.5 * np.cos(fade_top * np.pi)
    fade_bottom = np.clip((target_h - py) / 200.0, 0.0, 1.0)
    fade_bottom = 0.5 - 0.5 * np.cos(fade_bottom * np.pi)
    
    box_alpha = fade_left * fade_right * fade_top * fade_bottom
    
    for c in range(3):
        bg_patch = canvas[pos_y:pos_y+target_h, pos_x:pos_x+target_w, c]
        canvas[pos_y:pos_y+target_h, pos_x:pos_x+target_w, c] = (
            port_res[:, :, c] * box_alpha + bg_patch * (1.0 - box_alpha)
        )
        
    final_img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    final_img.save(output_path, quality=94, method=6)
    print(f"Saved {output_path}")

if __name__ == '__main__':
    var_a_path = 'media-workspace/portrait-session-03/final_variant_a_narrow_light.jpg'
    var_b_path = 'media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg'
    
    create_desktop_composite(var_a_path, 'public/hero/hero-portrait-a-desktop.webp')
    create_mobile_composite(var_a_path, 'public/hero/hero-portrait-a-mobile.webp')
    
    create_desktop_composite(var_b_path, 'public/hero/hero-portrait-b-desktop.webp')
    create_mobile_composite(var_b_path, 'public/hero/hero-portrait-b-mobile.webp')
    print("All hero composites regenerated successfully.")
