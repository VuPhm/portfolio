# Round 04.13 — Chromatic Scroll Lighting & Asset Archive

**Archive Date**: 2026-11-13  
**Branch**: `feat/hero-chromatic-scroll-r0413`  
**Purpose**: Preservation of Clean-Room Round 04.12 Master Stills, Non-Linear Chromatic Scroll Lighting Pipeline, and Reproducible Offline Sequence Render Assets.

---

## 1. Master Still Assets & Lineage

| Asset | Format | Resolution | Description |
| :--- | :--- | :--- | :--- |
| `master_concept_a_obsidian_silver.jpg` | JPEG | 1376×768 | Raw AI Clean-Room Master A (Pure Monochrome Silver). |
| `master_concept_b_subtle_chromatic.jpg` | JPEG | 1376×768 | Raw AI Clean-Room Master B (Subtle Chromatic: violet rim + amber corner). |
| `master_1080p_concept_a.png` | PNG | 1920×1080 | Full HD Master A (Single-pass Lanczos + subtle specular unsharp mask). |
| `master_1080p_concept_b.png` | PNG | 1920×1080 | Full HD Master B (Single-pass Lanczos + subtle specular unsharp mask). |

### Lineage & Privacy Preservation
- **Identity Source**: Derived from authentic user studio photograph `IMG_0064` under clean-room conditions via multi-modal AI image generation.
- **Privacy Boundary**: Private original raw photos are **not** committed to public repositories.
- **Geometry Invariance**: Concept A and Concept B share exact pixel-level anatomical alignment ($\Delta x = 0, \Delta y = 0$ at all facial and environmental anchors).

---

## 2. Scroll-Driven Chromatic Motion Pipeline

The 60-frame desktop sequence scrubs deterministically based on scroll progress $p \in [0.0, 1.0]$:

```
[0.00 - 0.18] Silver Intro      -> Pure monochrome silver specular, static pin-sharp portrait
[0.18 - 0.50] Awakening         -> Violet glow awakens on left rim, highlight moves across ribbon
[0.50 - 0.68] Chromatic Peak    -> Full Concept B brilliance: violet left + amber right corner
[0.68 - 1.00] Gallery Hand-off  -> Light softly settles into obsidian, leading into #collections
```

### Non-Linear Easing Functions
- **Smoothstep**: $S(t) = t^2(3 - 2t)$ where $t = \text{clamp}\left(\frac{p - p_0}{p_1 - p_0}, 0, 1\right)$.
- **Violet Glow Weight ($w_v$)**:
  $$w_v(p) = \begin{cases} 0.0 & p < 0.18 \\ S\left(\frac{p - 0.18}{0.32}\right) & 0.18 \le p < 0.50 \\ 1.0 & 0.50 \le p \le 0.68 \\ 1.0 - 0.65 \cdot S\left(\frac{p - 0.68}{0.32}\right) & p > 0.68 \end{cases}$$
- **Amber Glow Weight ($w_a$)**: Awakens at $p = 0.22$, reaches $1.0$ at $p = 0.52$, holds until $p = 0.68$, settles to $0.30$ at $p = 1.00$.
- **Traveling Ribbon Specular ($x_{\text{ribbon}}$)**: Coordinates travel non-linearly from $x = 300\text{px}$ to $x = 1600\text{px}$ following curve $x(t) = 300 + 1300 \cdot t^{0.85}$.
- **Character Protection Lock**: The anatomical mask `mask_character_protect.png` strictly zeroes out any chromatic delta over the face, hair, neck, and tailored blazer, ensuring 100% skin and fabric stability with zero color bleeding or ghosting.

---

## 3. Contact Sheets & Verification

- `keyframe_contact_sheet.png`: 7-stage progression contact sheet (0%, 18%, 35%, 50%, 68%, 85%, 100%).
- `comparison_contact_sheet.png`: 4-quadrant comparison (Baseline Monochrome Silver vs Target Plate vs Master A vs Master B).
- `crops/`: 1:1 pixel evaluation crops for face, cheek, neck/shoulder, and hair/headroom.
- `previews/`: Live typography overlay tests at 1920×1080, 1440×900, and 1280×800.

---

## 4. Reproducibility

To re-render all 60 WebP sequence frames from this directory:
```bash
python3 render_chromatic_sequence.py
```
Outputs match the production WebP sequence in `public/hero-sequence/desktop-chromatic/`.
