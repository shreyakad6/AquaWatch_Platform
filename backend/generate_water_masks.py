"""
generate_water_masks.py
-----------------------
Generates a static 2x3 grid PNG:
    Top row    → Simulated Sentinel-2 RGB satellite composites
    Bottom row → Corresponding water segmentation masks (blue on white)

No map UI.  No animation.  No external API.
Output: outputs/water_segmentation_grid.png
"""

import subprocess, sys

# Auto-install required packages if missing
for pkg in ["numpy", "matplotlib", "scipy"]:
    try:
        __import__(pkg)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from scipy.ndimage import zoom, binary_erosion
import os, pathlib

# ── Output path ──────────────────────────────────────────────────────────────
OUT_DIR  = pathlib.Path(__file__).parent / "outputs"
OUT_DIR.mkdir(exist_ok=True)
OUT_FILE = OUT_DIR / "water_segmentation_grid.png"

# ── Constants ─────────────────────────────────────────────────────────────────
SIZE = 256                          # pixels per tile
RNG  = np.random.default_rng(42)   # fixed seed → reproducible

# Approximate Sentinel-2 true-colour values (0-1 float)
C = {
    "water_deep":   np.array([0.08, 0.22, 0.50]),
    "water_shallow":np.array([0.20, 0.44, 0.68]),
    "land":         np.array([0.55, 0.49, 0.37]),
    "vegetation":   np.array([0.21, 0.41, 0.19]),
    "urban":        np.array([0.60, 0.57, 0.54]),
    "silt":         np.array([0.62, 0.54, 0.34]),
    "sand":         np.array([0.78, 0.72, 0.55]),
    "foam":         np.array([0.87, 0.92, 0.96]),
}

SCENES = [
    {"name": "Godavari River\n(Nashik — 2024)",         "type": "river",     "water_pct": 0.28},
    {"name": "Jayakwadi Reservoir\n(Aurangabad — 2023)", "type": "reservoir", "water_pct": 0.55},
    {"name": "Mumbai Harbour Bay\n(Coastal — 2022)",     "type": "coast",     "water_pct": 0.62},
]

# ── Noise helper (scipy zoom — no PIL needed) ─────────────────────────────────
def fractal_noise(h, w, roughness=4):
    """Multi-octave fractal noise in [0, 1] via scipy zoom."""
    acc = np.zeros((h, w))
    amp = 1.0
    for octave in range(5):
        scale  = max(2, h // (2 ** (octave + roughness // 2)))
        raw    = RNG.random((scale, scale))
        scaled = zoom(raw, (h / scale, w / scale), order=1)
        # clip to (h, w) in case zoom overshoots by 1 pixel
        scaled = scaled[:h, :w]
        acc   += amp * scaled
        amp   *= 0.55
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-9)

# ── Scene generators ──────────────────────────────────────────────────────────

def river_scene(size, water_pct):
    img  = np.zeros((size, size, 3))
    mask = np.zeros((size, size), bool)

    land_n = fractal_noise(size, size, roughness=3)
    veg_n  = fractal_noise(size, size, roughness=2)

    # Background: land/vegetation blend
    for y in range(size):
        for x in range(size):
            t = veg_n[y, x]
            img[y, x] = C["vegetation"] * t + C["land"] * (1 - t)

    # Meandering river channel
    width  = int(size * water_pct)
    cx     = size * 0.5
    amp    = size * 0.20
    freq   = 2 * np.pi / size * 1.8

    for y in range(size):
        centre = cx + amp * np.sin(freq * y)
        x0 = int(np.clip(centre - width / 2, 0, size - 1))
        x1 = int(np.clip(centre + width / 2, 0, size - 1))

        # Silt banks (2 px each side)
        for bx in range(max(0, x0 - 2), min(size, x0)):
            img[y, bx] = C["silt"]
        for bx in range(x1, min(size, x1 + 2)):
            img[y, bx] = C["silt"]

        # Water pixels
        for x in range(x0, x1 + 1):
            t = max(0.0, 1 - abs(x - centre) / max(1, width / 2))
            img[y, x]  = C["water_deep"] * t + C["water_shallow"] * (1 - t)
            mask[y, x] = True

    haze = RNG.random((size, size, 3)) * 0.03
    return np.clip(img + haze, 0, 1), mask


def reservoir_scene(size, water_pct):
    img  = np.zeros((size, size, 3))
    mask = np.zeros((size, size), bool)

    bg_n = fractal_noise(size, size, roughness=4)

    # Background: hilly vegetation
    for y in range(size):
        for x in range(size):
            t = bg_n[y, x]
            img[y, x] = C["vegetation"] * t + C["land"] * (1 - t)

    # Elliptical reservoir
    cy, cx = size * 0.47, size * 0.51
    ry = size * 0.36 * (water_pct ** 0.5)
    rx = size * 0.44 * (water_pct ** 0.5)

    for y in range(size):
        for x in range(size):
            r = ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2
            if r <= 1.0:
                t = (1 - r) ** 0.4
                img[y, x]  = C["water_deep"] * t + C["water_shallow"] * (1 - t)
                mask[y, x] = True

    # Dam embankment
    dam_y = int(cy + ry * 0.91)
    if 0 <= dam_y < size - 4:
        img[dam_y : dam_y + 4, :] = [0.33, 0.30, 0.28]

    haze = RNG.random((size, size, 3)) * 0.025
    return np.clip(img + haze, 0, 1), mask


def coast_scene(size, water_pct):
    img  = np.zeros((size, size, 3))
    mask = np.zeros((size, size), bool)

    land_n = fractal_noise(size, size, roughness=3)
    shore_x = int(size * (1 - water_pct))

    for y in range(size):
        for x in range(size):
            n = land_n[y, x]
            if x < shore_x:
                beach_zone = shore_x - int(size * 0.10)
                if x >= beach_zone:
                    img[y, x] = C["sand"]
                elif n > 0.62:
                    img[y, x] = C["urban"]
                else:
                    img[y, x] = C["vegetation"] * n + C["land"] * (1 - n)
            else:
                depth = (x - shore_x) / max(1, size - shore_x)
                img[y, x]  = C["water_shallow"] * (1 - depth) + C["water_deep"] * depth
                mask[y, x] = True

    # Foam fringe along shoreline
    for y in range(size):
        fx = shore_x + int(RNG.integers(-5, 5))
        if 0 <= fx < size:
            img[y, max(0, fx - 2) : fx + 2] = C["foam"]

    haze = RNG.random((size, size, 3)) * 0.02
    return np.clip(img + haze, 0, 1), mask


GENERATORS = {
    "river":     river_scene,
    "reservoir": reservoir_scene,
    "coast":     coast_scene,
}

# ── Mask renderer ─────────────────────────────────────────────────────────────

def render_mask(mask):
    """White background, blue where water, dark-blue border on water edge."""
    rgba = np.ones((*mask.shape, 4), dtype=np.float32)   # white + opaque

    # Blue fill
    rgba[mask, 0] = 0.09
    rgba[mask, 1] = 0.42
    rgba[mask, 2] = 0.83
    rgba[mask, 3] = 1.00

    # Dark edge
    inner  = binary_erosion(mask, iterations=2)
    border = mask & ~inner
    rgba[border, 0] = 0.04
    rgba[border, 1] = 0.16
    rgba[border, 2] = 0.52
    rgba[border, 3] = 1.00

    return rgba

# ── Figure builder ────────────────────────────────────────────────────────────

def build_grid():
    n = len(SCENES)
    fig, axes = plt.subplots(
        2, n,
        figsize=(n * 4.4, 9.2),
        facecolor="white",
        gridspec_kw={"hspace": 0.10, "wspace": 0.05},
    )

    for col, scene in enumerate(SCENES):
        sat, mask = GENERATORS[scene["type"]](SIZE, scene["water_pct"])
        mask_rgba = render_mask(mask)
        coverage  = mask.mean() * 100

        # ── Row 0 : satellite image ──
        ax = axes[0, col]
        ax.imshow(sat, interpolation="bilinear")
        ax.set_title(scene["name"], fontsize=10.5, fontweight="bold",
                     color="#1a1a2e", pad=7)
        ax.axis("off")

        # Top-left badge
        ax.text(0.02, 0.97, "Sentinel-2 RGB", transform=ax.transAxes,
                fontsize=7.5, color="white", va="top", ha="left",
                bbox=dict(boxstyle="round,pad=0.25", fc="#1a1a2e", alpha=0.75, ec="none"))
        # Top-right NDWI badge
        ndwi_approx = 0.20 + mask.mean() * 0.55
        ax.text(0.98, 0.97, f"NDWI ≈ {ndwi_approx:.2f}", transform=ax.transAxes,
                fontsize=7.5, color="white", va="top", ha="right",
                bbox=dict(boxstyle="round,pad=0.25", fc="#0a4c8c", alpha=0.80, ec="none"))

        # ── Row 1 : segmentation mask ──
        ax2 = axes[1, col]
        ax2.imshow(mask_rgba, interpolation="nearest")
        ax2.set_title("Water Segmentation Mask", fontsize=9.5,
                      fontweight="semibold", color="#1a1a2e", pad=5)
        ax2.axis("off")

        # Coverage label
        ax2.text(0.5, 0.030, f"Water coverage: {coverage:.1f}%",
                 transform=ax2.transAxes, fontsize=8.2, color="#0a3a6e",
                 va="bottom", ha="center",
                 bbox=dict(boxstyle="round,pad=0.3", fc="white",
                           alpha=0.90, ec="#a8c8e8"))

    # ── Horizontal divider between rows ──
    divider = plt.Line2D(
        [0.03, 0.97], [0.505, 0.505],
        transform=fig.transFigure,
        color="#cccccc", linewidth=0.8, linestyle="--",
    )
    fig.add_artist(divider)

    # ── Row labels (left margin) ──
    fig.text(0.005, 0.755, "Satellite\nImagery",
             fontsize=9.5, fontweight="bold", color="#222",
             va="center", ha="left", rotation=90)
    fig.text(0.005, 0.255, "Water\nMask",
             fontsize=9.5, fontweight="bold", color="#0a4c8c",
             va="center", ha="left", rotation=90)

    # ── Legend ──
    patches = [
        mpatches.Patch(fc=(0.09, 0.42, 0.83), ec=(0.04, 0.16, 0.52),
                       lw=1.2, label="Water (detected)"),
        mpatches.Patch(fc="white", ec="#bbb", lw=0.8, label="Non-water / Land"),
    ]
    fig.legend(handles=patches, loc="lower center", ncol=2,
               fontsize=9, frameon=True, edgecolor="#ddd",
               facecolor="white", bbox_to_anchor=(0.5, -0.005))

    # ── Main title ──
    fig.suptitle(
        "Maharashtra Water Monitoring  ·  Sentinel-2 Satellite & NDWI Segmentation Masks  (2022 – 2024)",
        fontsize=11.5, fontweight="bold", color="#0a1628", y=1.012,
    )

    plt.savefig(OUT_FILE, dpi=180, bbox_inches="tight",
                facecolor="white", pad_inches=0.18)
    plt.close(fig)
    print(f"[OK] Saved → {OUT_FILE}")
    return str(OUT_FILE)


if __name__ == "__main__":
    path = build_grid()
    print(f"[DONE] {path}")
