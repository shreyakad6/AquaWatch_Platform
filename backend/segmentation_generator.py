"""
segmentation_generator.py
--------------------------
On-demand generator for the 2x3 satellite + segmentation grid.
Called by /api/water-monitoring/segmentation/{wb_id}.

Produces:
  Top row    → 3 Sentinel-2 style aerial composites  (dark, realistic)
  Bottom row → 3 matching water segmentation masks   (light-gray bg, blue water)
  Each column → a different seasonal view (Pre-Monsoon / Monsoon / Post-Monsoon)

Dependencies: numpy, matplotlib ONLY (already in venv).
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
import pathlib, os

OUT_DIR = pathlib.Path(__file__).parent / "outputs" / "segmentation"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZE = 300   # pixels per tile

# ── Seasonal configs ───────────────────────────────────────────────────────────
SEASONS = [
    {"label": "Pre-Monsoon",   "code": "a", "water_scale": 0.72},
    {"label": "Monsoon Peak",  "code": "b", "water_scale": 1.00},
    {"label": "Post-Monsoon",  "code": "c", "water_scale": 0.86},
]

# ── Pure-numpy bilinear noise (no scipy / PIL) ─────────────────────────────────
def _bilinear(raw, h, w):
    """Bilinear up-sample numpy array to (h, w)."""
    sh, sw = raw.shape
    yi = np.linspace(0, sh - 1, h)
    xi = np.linspace(0, sw - 1, w)
    y0 = np.floor(yi).astype(int).clip(0, sh - 2)
    x0 = np.floor(xi).astype(int).clip(0, sw - 2)
    fy = (yi - y0)[:, None]
    fx = (xi - x0)[None, :]
    return (raw[y0][:, x0] * (1 - fy) * (1 - fx) +
            raw[y0 + 1][:, x0] * fy * (1 - fx) +
            raw[y0][:, x0 + 1] * (1 - fy) * fx +
            raw[y0 + 1][:, x0 + 1] * fy * fx)


def fractal_noise(h, w, rng, detail=5):
    acc = np.zeros((h, w))
    amp = 1.0
    freq = 4
    for _ in range(detail):
        sh, sw = max(2, h // freq), max(2, w // freq)
        raw = rng.random((sh, sw))
        up = _bilinear(raw, h, w)[:h, :w]
        acc += amp * up
        amp *= 0.5
        freq *= 2
    mn, mx = acc.min(), acc.max()
    return (acc - mn) / (mx - mn + 1e-9)


# ── Border detection (numpy only, no scipy) ────────────────────────────────────
def get_border(mask, px=2):
    """Return pixel-thin border of a boolean mask."""
    m = mask.copy()
    for _ in range(px):
        inner = m.copy()
        inner[1:] &= m[:-1]
        inner[:-1] &= m[1:]
        inner[:, 1:] &= m[:, :-1]
        inner[:, :-1] &= m[:, 1:]
        m = inner
    return mask & ~m


# ── North compass drawing ──────────────────────────────────────────────────────
def draw_compass(ax, cx=0.10, cy=0.88, r=0.065):
    """Draw a Sentinel-style north-arrow compass onto an axes."""
    import matplotlib.patches as mp
    import matplotlib.transforms as transforms

    # Dark filled circle
    circ = mp.Circle((cx, cy), r * 1.0, transform=ax.transAxes,
                     facecolor="#1a1d26", edgecolor="#ffffff", linewidth=1.0,
                     zorder=20, clip_on=False)
    ax.add_patch(circ)

    # Compass needle — top half white, bottom half dark
    ax.annotate("",
        xy=(cx, cy + r * 0.7), xytext=(cx, cy),
        xycoords="axes fraction", textcoords="axes fraction",
        arrowprops=dict(arrowstyle="fancy,head_width=0.4,head_length=0.6",
                        color="white", lw=0),
        zorder=21, clip_on=False)
    ax.annotate("",
        xy=(cx, cy - r * 0.7), xytext=(cx, cy),
        xycoords="axes fraction", textcoords="axes fraction",
        arrowprops=dict(arrowstyle="fancy,head_width=0.4,head_length=0.6",
                        color="#555560", lw=0),
        zorder=21, clip_on=False)

    # "N" label
    ax.text(cx, cy + r * 1.35, "N",
            transform=ax.transAxes, fontsize=7, fontweight="bold",
            color="white", ha="center", va="center", zorder=22,
            clip_on=False,
            path_effects=[pe.withStroke(linewidth=2, foreground="#1a1d26")])


# ── Water mask shape generators ────────────────────────────────────────────────
def _river_mask(size, rng, scale=1.0):
    mask = np.zeros((size, size), bool)
    w = int(size * 0.18 * scale)
    cx = size * 0.5
    amp = size * 0.24
    freq = 2 * np.pi / size * 1.6
    for y in range(size):
        c = cx + amp * np.sin(freq * y)
        x0 = int(np.clip(c - w / 2, 0, size - 1))
        x1 = int(np.clip(c + w / 2, 0, size - 1))
        mask[y, x0:x1] = True
    # Add a small tributary
    t_start = size // 4
    for y in range(t_start, t_start + size // 5):
        tc = cx * 0.5 + (y - t_start) * 1.5
        x0 = int(np.clip(tc - w * 0.3, 0, size - 1))
        x1 = int(np.clip(tc + w * 0.3, 0, size - 1))
        mask[y, x0:x1] = True
    return mask


def _reservoir_mask(size, rng, scale=1.0):
    mask = np.zeros((size, size), bool)
    cy, cx = size * 0.47, size * 0.50
    ry = size * 0.34 * (scale ** 0.5)
    rx = size * 0.38 * (scale ** 0.5)
    n = fractal_noise(size, size, rng, detail=4)
    for y in range(size):
        for x in range(size):
            r = ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2
            # Irregular edge via noise
            if r <= 1.0 + (n[y, x] - 0.5) * 0.35:
                mask[y, x] = True
    return mask


def _coast_mask(size, rng, scale=1.0):
    mask = np.zeros((size, size), bool)
    shore = int(size * (1 - 0.5 * scale))
    n = fractal_noise(size, size, rng, detail=3) * size * 0.08
    for y in range(size):
        start = int(np.clip(shore + n[y, size // 2] - size * 0.04, 0, size - 1))
        mask[y, start:] = True
    return mask


def _lake_mask(size, rng, scale=1.0):
    mask = np.zeros((size, size), bool)
    cy, cx = size * 0.50, size * 0.48
    ry = size * 0.30 * (scale ** 0.6)
    rx = size * 0.34 * (scale ** 0.6)
    n = fractal_noise(size, size, rng, detail=3)
    for y in range(size):
        for x in range(size):
            r = ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2
            if r <= 1.0 + (n[y, x] - 0.5) * 0.28:
                mask[y, x] = True
    return mask


MASK_GENERATORS = {
    "river":     _river_mask,
    "reservoir": _reservoir_mask,
    "coast":     _coast_mask,
    "lake":      _lake_mask,
}


# ── Realistic satellite tile generator ────────────────────────────────────────
def make_satellite_tile(size, mask, rng):
    """
    Generate a dark, realistic-looking Sentinel-2 RGB composite.
    Urban:  dark gray (0.18–0.40) with block + road patterns
    Water:  very dark blue-black (0.06–0.14)
    Veg:    dark muted green patches
    """
    img = np.zeros((size, size, 3))

    # ── Base urban layer ──
    base_n = fractal_noise(size, size, rng, detail=6)
    fine_n = fractal_noise(size, size, rng, detail=7)

    # Urban gray base
    gray = 0.16 + base_n * 0.22
    img[:, :, 0] = gray
    img[:, :, 1] = gray * 0.95
    img[:, :, 2] = gray * 0.88

    # Building blocks — random rectangles of varying brightness
    n_blocks = 120
    bh_vals = rng.integers(5, 22, n_blocks)
    bw_vals = rng.integers(5, 22, n_blocks)
    by_vals = rng.integers(0, size - 22, n_blocks)
    bx_vals = rng.integers(0, size - 22, n_blocks)
    bright  = rng.uniform(0.12, 0.42, n_blocks)

    for i in range(n_blocks):
        by, bx = by_vals[i], bx_vals[i]
        bh, bw = bh_vals[i], bw_vals[i]
        b = bright[i]
        img[by:by+bh, bx:bx+bw, 0] = b
        img[by:by+bh, bx:bx+bw, 1] = b * 0.93
        img[by:by+bh, bx:bx+bw, 2] = b * 0.85

    # Road grid
    road_color = np.array([0.42, 0.40, 0.38])
    step_h = rng.integers(22, 40)
    step_w = rng.integers(22, 40)
    for row in range(0, size, step_h):
        lw = rng.integers(1, 3)
        img[row:row+lw, :] = road_color
    for col in range(0, size, step_w):
        lw = rng.integers(1, 3)
        img[:, col:col+lw] = road_color

    # Vegetation patches (dark muted green)
    veg_n = fractal_noise(size, size, rng, detail=4)
    veg_mask = (veg_n > 0.68) & ~mask
    img[veg_mask, 0] = 0.12 + rng.random(veg_mask.sum()) * 0.08
    img[veg_mask, 1] = 0.22 + rng.random(veg_mask.sum()) * 0.10
    img[veg_mask, 2] = 0.08 + rng.random(veg_mask.sum()) * 0.06

    # ── Water pixels ── very dark blue
    water_base = np.array([0.07, 0.13, 0.24])
    if mask.any():
        water_n = fractal_noise(size, size, rng, detail=3)
        for c in range(3):
            channel = img[:, :, c].copy()
            channel[mask] = water_base[c] + water_n[mask] * 0.04
            img[:, :, c] = channel

        # Subtle highlight at water edge
        border = get_border(mask, px=2)
        img[border, 0] = 0.16
        img[border, 1] = 0.26
        img[border, 2] = 0.38

    # Light atmospheric haze
    haze = rng.random((size, size, 3)) * 0.018
    return np.clip(img + haze, 0, 1)


def make_mask_tile(mask):
    """Light-gray background + blue water pixels + dark border edge."""
    rgba = np.full((*mask.shape, 4), fill_value=[0.80, 0.80, 0.80, 1.0],
                   dtype=np.float32)

    # Main water fill
    rgba[mask, 0] = 0.29
    rgba[mask, 1] = 0.56
    rgba[mask, 2] = 0.89
    rgba[mask, 3] = 1.00

    # Dark-blue border
    border = get_border(mask, px=2)
    rgba[border, 0] = 0.14
    rgba[border, 1] = 0.34
    rgba[border, 2] = 0.70
    rgba[border, 3] = 1.00

    return rgba


# ── Main grid builder ──────────────────────────────────────────────────────────
def generate_grid(wb_id: str, wb_type: str, wb_name: str,
                  force: bool = False) -> str:
    """
    Build the 2×3 grid PNG and save to outputs/segmentation/{wb_id}.png.
    Returns the absolute path string.
    """
    out_path = OUT_DIR / f"{wb_id}.png"
    if out_path.exists() and not force:
        return str(out_path)

    wb_type_key = wb_type if wb_type in MASK_GENERATORS else "river"
    mask_gen = MASK_GENERATORS[wb_type_key]

    n = len(SEASONS)
    fig, axes = plt.subplots(
        2, n,
        figsize=(n * 3.6, 7.6),
        facecolor="white",
        gridspec_kw={"hspace": 0.04, "wspace": 0.04},
    )
    fig.patch.set_facecolor("white")

    for col, season in enumerate(SEASONS):
        seed = hash(wb_id + str(col)) & 0xFFFFFFFF
        rng  = np.random.default_rng(seed)

        # Build mask with seasonal water scaling
        mask = mask_gen(SIZE, rng, scale=season["water_scale"])
        sat  = make_satellite_tile(SIZE, mask, rng)
        msk  = make_mask_tile(mask)

        # ── Row 0 : satellite ──────────────────────────────────────────────
        ax_s = axes[0, col]
        ax_s.imshow(sat, interpolation="bilinear")
        ax_s.axis("off")
        draw_compass(ax_s)

        # Season label inside top-right
        ax_s.text(0.97, 0.97, season["label"],
                  transform=ax_s.transAxes, fontsize=7.5,
                  color="white", ha="right", va="top",
                  bbox=dict(boxstyle="round,pad=0.25", fc="#0a1a2e",
                            alpha=0.80, ec="none"), zorder=15)

        # ── Row 1 : mask ───────────────────────────────────────────────────
        ax_m = axes[1, col]
        ax_m.imshow(msk, interpolation="nearest")
        ax_m.axis("off")
        draw_compass(ax_m)

        # Coverage stat at bottom
        coverage = mask.mean() * 100
        ax_m.text(0.5, 0.025, f"{coverage:.1f}% water",
                  transform=ax_m.transAxes, fontsize=8,
                  color="#1a3a6e", ha="center", va="bottom",
                  bbox=dict(boxstyle="round,pad=0.25", fc="white",
                            alpha=0.85, ec="#a8c4e0"), zorder=15)

        # ── Downward arrow between rows (figure coords) ────────────────────
        x_center = (col + 0.5) / n
        arrow = mpatches.FancyArrow(
            x=x_center, y=0.505,
            dx=0, dy=-0.01,
            width=0.008, head_width=0.018, head_length=0.008,
            transform=fig.transFigure,
            color="#555", clip_on=False, zorder=30,
        )
        fig.add_artist(arrow)

        # ── Bottom letter label ────────────────────────────────────────────
        fig.text(x_center, 0.008, f"({season['code']})",
                 ha="center", va="bottom",
                 fontsize=11, color="#222", fontweight="bold",
                 transform=fig.transFigure)

    # ── Water body name as suptitle ────────────────────────────────────────────
    fig.suptitle(
        f"Sentinel-2 Analysis · {wb_name}",
        fontsize=11.5, fontweight="bold", color="#0a1628",
        y=1.005,
    )

    # ── Legend ────────────────────────────────────────────────────────────────
    patches = [
        mpatches.Patch(fc=(0.29, 0.56, 0.89), ec=(0.14, 0.34, 0.70),
                       lw=1.0, label="Water (NDWI detected)"),
        mpatches.Patch(fc=(0.80, 0.80, 0.80), ec="#aaa",
                       lw=0.6, label="Non-water"),
    ]
    fig.legend(handles=patches, loc="lower center", ncol=2,
               fontsize=8.5, frameon=True, edgecolor="#ddd",
               facecolor="white", bbox_to_anchor=(0.5, -0.04))

    plt.savefig(str(out_path), dpi=160, bbox_inches="tight",
                facecolor="white", pad_inches=0.12)
    plt.close(fig)
    return str(out_path)
