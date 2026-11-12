#!/usr/bin/env python3
"""
Generate Precision Lighting Variants A & B for Hero Integration.
Maintains 100% strict identity preservation from the selected master portrait.
Obsidian base: #06070a (RGB: 6, 7, 10).
"""
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

def load_master():
    img = Image.open('media-workspace/portrait-session-03/ai_variant_b_v2.jpg').convert('RGB')
    return np.array(img, dtype=np.float32)

def generate_variant_a_narrow_light(base_arr):
    """
    Variant A: Narrow Light.
    A razor-focused shaft of light illuminating the bridge of the nose,
    front cheekbone contour, and eye, with smooth rapid falloff into darkness.
    """
    h, w, _ = base_arr.shape
    y_grid, x_grid = np.mgrid[0:h, 0:w]
    
    # Target face center: nose/cheek is at x ≈ 310, y ≈ 520
    # Beam along vertical-diagonal axis
    # Beam center around x = 290 to 360
    beam_dist = np.abs(x_grid - (310 + (y_grid - 520) * 0.08))
    # Gaussian narrow beam width
    beam_mask = np.exp(-(beam_dist ** 2) / (2 * (85.0 ** 2)))
    
    # Soft vertical window focusing on midface (eyes to chin: y from 300 to 750)
    vert_falloff = np.exp(-((y_grid - 500) ** 2) / (2 * (240.0 ** 2)))
    beam_mask = beam_mask * (0.35 + 0.65 * vert_falloff)
    
    # Ambient baseline in shadow (just enough to keep facial form readable, near black)
    ambient = 0.12
    light_modulator = ambient + (1.25 - ambient) * beam_mask
    
    # Keep the fine rim on the hair crest intact as an accent
    # Hair crest is near top: y < 350, x between 300 and 700
    rim_preserve = np.exp(-((y_grid - 220) ** 2) / (2 * (100.0 ** 2))) * np.exp(-((x_grid - 600) ** 2) / (2 * (180.0 ** 2)))
    light_modulator = np.maximum(light_modulator, ambient + 0.65 * rim_preserve)
    
    # Modulate
    out_arr = base_arr.copy()
    for c in range(3):
        out_arr[:, :, c] = out_arr[:, :, c] * light_modulator
        
    # Near-black floor at #06070a
    bg = np.array([6, 7, 10], dtype=np.float32)
    # Background blend at outer borders
    edge_dist_right = np.clip((x_grid - (w * 0.6)) / (w * 0.35), 0.0, 1.0)
    edge_dist_bottom = np.clip((y_grid - (h * 0.75)) / (h * 0.22), 0.0, 1.0)
    fade = np.maximum(edge_dist_right, edge_dist_bottom)
    
    for c in range(3):
        out_arr[:, :, c] = out_arr[:, :, c] * (1.0 - fade) + bg[c] * fade
        # Ensure deep shadow floor does not go below true background
        out_arr[:, :, c] = np.maximum(out_arr[:, :, c], bg[c] * 0.9)
        
    return np.clip(out_arr, 0, 255).astype(np.uint8)

def generate_variant_b_subtle_rim(base_arr):
    """
    Variant B: Subtle Rim.
    Face in deep low-key shadow with a delicate rim light outlining
    the crest of hair, back of head, jawline and shoulder.
    """
    h, w, _ = base_arr.shape
    y_grid, x_grid = np.mgrid[0:h, 0:w]
    
    # In base_arr, the rim light is already captured naturally on the right contour.
    # To achieve "Khuôn mặt tối sâu, chỉ có viền sáng nhẹ ở tóc, sống mũi hoặc vai",
    # we deepen the front face fill to deep velvety tones, letting the rim take precedence.
    
    # Face region mask: x around 200 to 450, y around 350 to 750
    face_dist = ((x_grid - 330) / 130.0) ** 2 + ((y_grid - 530) / 200.0) ** 2
    face_mask = np.exp(-face_dist / 2.0)
    
    # Subtle darkening factor on face to create extreme low-key mood
    face_attenuation = 1.0 - (0.45 * face_mask)
    
    out_arr = base_arr.copy()
    for c in range(3):
        out_arr[:, :, c] = out_arr[:, :, c] * face_attenuation
        
    # Seamless fade to #06070a background
    bg = np.array([6, 7, 10], dtype=np.float32)
    edge_dist_right = np.clip((x_grid - (w * 0.62)) / (w * 0.33), 0.0, 1.0)
    edge_dist_bottom = np.clip((y_grid - (h * 0.78)) / (h * 0.20), 0.0, 1.0)
    fade = np.maximum(edge_dist_right, edge_dist_bottom)
    
    for c in range(3):
        out_arr[:, :, c] = out_arr[:, :, c] * (1.0 - fade) + bg[c] * fade
        out_arr[:, :, c] = np.maximum(out_arr[:, :, c], bg[c] * 0.9)
        
    return np.clip(out_arr, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    base = load_master()
    
    var_a = generate_variant_a_narrow_light(base)
    Image.fromarray(var_a).save('media-workspace/portrait-session-03/final_variant_a_narrow_light.jpg', quality=96)
    
    var_b = generate_variant_b_subtle_rim(base)
    Image.fromarray(var_b).save('media-workspace/portrait-session-03/final_variant_b_subtle_rim.jpg', quality=96)
    
    print("Final variants A and B generated successfully.")

