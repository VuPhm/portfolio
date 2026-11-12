#!/usr/bin/env python3
"""
Direct Compositing & Relighting Pipeline for VUPHM Hero Portrait.
Uses real photograph (IMG_0211 or IMG_0064) with neural segmentation mask,
applying dark studio chiaroscuro lighting, clothing tone-mapping to matte black,
and seamless blend into the #06070a obsidian hero stage.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, distance_transform_edt

def load_and_preprocess(img_path, mask_path):
    img = Image.open(img_path).convert('RGB')
    mask = Image.open(mask_path).convert('L')
    
    # Ensure same size
    if mask.size != img.size:
        mask = mask.resize(img.size, Image.Resampling.BILINEAR)
        
    return np.array(img, dtype=np.float32), np.array(mask, dtype=np.float32) / 255.0

def create_feathered_mask(mask_arr, feather_radius=3.0):
    # Smooth edges with gaussian blur to eliminate harsh cutout
    blurred = gaussian_filter(mask_arr, sigma=feather_radius)
    return np.clip(blurred, 0.0, 1.0)

def create_variant_a_narrow_light(img_arr, mask_arr):
    """
    Variant A: Narrow Light.
    A focused directional sliver of light illuminating the left side of the face
    (viewer's left or subject's left cheek/jaw), while rest fades into deep shadow.
    """
    h, w, _ = img_arr.shape
    
    # Create a directional light beam mask across face
    # Center of light around x=0.45 to 0.65 (where cheekbone/nose/jaw contour sits)
    y_grid, x_grid = np.mgrid[0:h, 0:w]
    x_norm = x_grid / float(w)
    y_norm = y_grid / float(h)
    
    # Narrow diagonal light beam: angle slightly tilted
    beam_pos = x_norm * 0.9 + y_norm * 0.15
    beam_center = 0.52
    beam_width = 0.18
    beam_intensity = np.exp(-((beam_pos - beam_center) ** 2) / (2 * (beam_width ** 2)))
    
    # Minimum ambient fill (very low key)
    ambient = 0.06
    light_map = ambient + (1.0 - ambient) * beam_intensity
    
    # Separate clothing vs skin/hair by color luminance
    # In IMG_0211, shirt is white (high brightness, low saturation)
    # Darken shirt to matte black
    r, g, b = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2]
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    
    # Lower half has shirt: y_norm > 0.6
    shirt_factor = np.clip((y_norm - 0.55) / 0.2, 0.0, 1.0)
    is_shirt = (luminance > 120) * shirt_factor
    
    processed = img_arr.copy()
    # Darken shirt significantly
    for c in range(3):
        processed[:, :, c] = processed[:, :, c] * (1.0 - is_shirt * 0.85)
        
    # Apply narrow light multiplier
    for c in range(3):
        processed[:, :, c] = processed[:, :, c] * light_map
        
    # Tone curve: lift shadows slightly to avoid banding, deep blacks to #06070a
    bg_color = np.array([6, 7, 10], dtype=np.float32)
    
    feathered_mask = create_feathered_mask(mask_arr, feather_radius=2.5)
    
    # Composite onto obsidian background
    output = np.zeros_like(img_arr)
    for c in range(3):
        output[:, :, c] = processed[:, :, c] * feathered_mask + bg_color[c] * (1.0 - feathered_mask)
        
    return np.clip(output, 0, 255).astype(np.uint8)

def create_variant_b_subtle_rim(img_arr, mask_arr):
    """
    Variant B: Subtle Rim.
    Deep dark face with a subtle kicker rim along the edge silhouette.
    """
    h, w, _ = img_arr.shape
    y_grid, x_grid = np.mgrid[0:h, 0:w]
    y_norm = y_grid / float(h)
    
    # Compute boundary of person mask using distance transform
    dist_inside = distance_transform_edt(mask_arr > 0.5)
    # Rim light band: 1 to 14 pixels from edge
    rim_band = np.exp(-((dist_inside - 4.0) ** 2) / (2 * (3.0 ** 2))) * (mask_arr > 0.2)
    
    # Base dark face illumination (very low-key)
    base_light = 0.14
    
    # Clothing darkening
    r, g, b = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2]
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    shirt_factor = np.clip((y_norm - 0.55) / 0.2, 0.0, 1.0)
    is_shirt = (luminance > 120) * shirt_factor
    
    processed = img_arr.copy()
    for c in range(3):
        processed[:, :, c] = processed[:, :, c] * (1.0 - is_shirt * 0.88)
        # Apply base darkness
        processed[:, :, c] = processed[:, :, c] * base_light
        # Add subtle rim boost
        processed[:, :, c] = processed[:, :, c] + (rim_band * 120.0)
        
    bg_color = np.array([6, 7, 10], dtype=np.float32)
    feathered_mask = create_feathered_mask(mask_arr, feather_radius=2.5)
    
    output = np.zeros_like(img_arr)
    for c in range(3):
        output[:, :, c] = processed[:, :, c] * feathered_mask + bg_color[c] * (1.0 - feathered_mask)
        
    return np.clip(output, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    img_path = 'media-workspace/portrait-session-03/IMG_0211_outdoor.jpg'
    mask_path = 'media-workspace/portrait-session-03/mask_IMG_0211.png'
    
    img_arr, mask_arr = load_and_preprocess(img_path, mask_path)
    
    var_a = create_variant_a_narrow_light(img_arr, mask_arr)
    Image.fromarray(var_a).save('media-workspace/portrait-session-03/real_composite_variant_a.jpg', quality=95)
    
    var_b = create_variant_b_subtle_rim(img_arr, mask_arr)
    Image.fromarray(var_b).save('media-workspace/portrait-session-03/real_composite_variant_b.jpg', quality=95)
    print("Real compositing variants A and B saved.")

