"""
real_sentinel_generator.py
--------------------------
Fetches REAL Sentinel-2 L2A imagery from Element84 Earth Search STAC +
AWS sentinel-cogs S3 (public, no auth required).

Output: 2x3 PNG grid
  Row 0 → Sentinel-2 RGB true-colour (Pre / Monsoon Peak / Post monsoon)
  Row 1 → NDWI water mask  (B03=Green, B08=NIR)

No synthetic pixels. No compass, icons, overlays.
"""

import os, pathlib, io, requests, numpy as np

# Set GDAL HTTP env BEFORE importing rasterio
os.environ.update({
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "CPL_VSIL_CURL_CACHE_SIZE": "100000000",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_TIMEOUT": "25",
    "CPL_CURL_VERBOSE": "0",
})

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds as win_from_bounds
    from rasterio.enums import Resampling
    _HAS_RASTERIO = True
except Exception:
    _HAS_RASTERIO = False

STAC = "https://earth-search.aws.element84.com/v1"
OUT  = pathlib.Path(__file__).parent / "outputs" / "real_seg"
OUT.mkdir(parents=True, exist_ok=True)
SZ   = (300, 300)   # output tile size pixels

YEARS = [2021, 2023, 2025]
SEASONS = [
    {"label": "2021", "code": "a", "date": "2021-01-01T00:00:00Z/2021-12-31T23:59:59Z"},
    {"label": "2023", "code": "b", "date": "2023-01-01T00:00:00Z/2023-12-31T23:59:59Z"},
    {"label": "2025", "code": "c", "date": "2025-01-01T00:00:00Z/2025-12-31T23:59:59Z"},
]

WGS84 = CRS.from_epsg(4326) if _HAS_RASTERIO else None


# ── STAC search ───────────────────────────────────────────────────────────────
def _stac_search(bbox, date_range, cloud_max=45):
    """Return the least-cloudy Sentinel-2 L2A item for bbox+date, or None."""
    try:
        r = requests.post(
            f"{STAC}/search",
            json={
                "collections": ["sentinel-2-l2a"],
                "bbox": bbox,
                "datetime": date_range,
                "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
                "limit": 6,
            },
            timeout=15,
        )
        r.raise_for_status()
        feats = r.json().get("features", [])
        valid = [f for f in feats
                 if f["properties"].get("eo:cloud_cover", 99) < cloud_max]
        return valid[0] if valid else (feats[0] if feats else None)
    except Exception as e:
        print(f"[STAC] {e}")
        return None


# ── COG reading ───────────────────────────────────────────────────────────────
def _read_band(url, bbox_wgs84, hw=SZ):
    """Read 1-band COG window, reproject bbox, return float32 (H,W)."""
    if not _HAS_RASTERIO:
        return None
    try:
        with rasterio.Env(GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                          CPL_VSIL_CURL_CACHE_SIZE=100000000,
                          GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                          VSI_CACHE="TRUE"):
            with rasterio.open(url) as src:
                bb = (transform_bounds(WGS84, src.crs, *bbox_wgs84)
                      if src.crs.to_epsg() != 4326 else bbox_wgs84)
                win = win_from_bounds(*bb, transform=src.transform)
                return src.read(1, window=win,
                                out_shape=hw,
                                resampling=Resampling.bilinear).astype(np.float32)
    except Exception as e:
        print(f"[COG-band] {e}")
        return None


def _read_rgb(url, bbox_wgs84, hw=SZ):
    """Read 3-band visual TCI COG, return uint8 (H,W,3)."""
    if not _HAS_RASTERIO:
        return None
    try:
        with rasterio.Env(GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                          CPL_VSIL_CURL_CACHE_SIZE=100000000,
                          GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                          VSI_CACHE="TRUE"):
            with rasterio.open(url) as src:
                bb = (transform_bounds(WGS84, src.crs, *bbox_wgs84)
                      if src.crs.to_epsg() != 4326 else bbox_wgs84)
                win = win_from_bounds(*bb, transform=src.transform)
                bands = src.read([1, 2, 3], window=win,
                                 out_shape=(3, *hw),
                                 resampling=Resampling.bilinear)
                # normalise from uint16 if needed
                if bands.dtype != np.uint8:
                    p2, p98 = np.percentile(bands, (2, 98))
                    bands = np.clip((bands - p2) / (p98 - p2 + 1e-6), 0, 1)
                    bands = (bands * 255).astype(np.uint8)
                return np.moveaxis(bands, 0, -1)  # (3,H,W)→(H,W,3)
    except Exception as e:
        print(f"[COG-rgb] {e}")
        return None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _ndwi_mask(b03, b08, thr=0.1):
    with np.errstate(divide="ignore", invalid="ignore"):
        n = np.where(b03 + b08 > 0, (b03 - b08) / (b03 + b08), 0.0)
    return n.astype(np.float32), n > thr


def _mask_rgba(mask):
    rgba = np.full((*mask.shape, 4), [0.80, 0.80, 0.80, 1.0], dtype=np.float32)
    rgba[mask] = [0.18, 0.50, 0.83, 1.0]
    eroded = mask.copy()
    eroded[1:]  &= mask[:-1];  eroded[:-1] &= mask[1:]
    eroded[:, 1:] &= mask[:, :-1]; eroded[:, :-1] &= mask[:, 1:]
    rgba[mask & ~eroded] = [0.07, 0.27, 0.62, 1.0]
    return rgba


def _placeholder(shape, text):
    arr = np.full((*shape, 3), 30, dtype=np.uint8)
    return arr, text


# ── Main generator ────────────────────────────────────────────────────────────
def generate_real_grid(wb_id, wb_name, wb_lat, wb_lng,
                       wb_type="river", force=False):
    out_path = OUT / f"{wb_id}.png"
    if out_path.exists() and not force:
        return str(out_path)

    pad_lon, pad_lat = 0.12, 0.10
    bbox = [round(wb_lng - pad_lon, 4), round(wb_lat - pad_lat, 4),
            round(wb_lng + pad_lon, 4), round(wb_lat + pad_lat, 4)]

    rgb_list, mask_list = [], []

    for season in SEASONS:
        print(f"[INFO] {wb_name} · {season['label']}")
        item = _stac_search(bbox, season["date"])
        if not item:
            rgb_list.append(None); mask_list.append(None); continue

        assets = item.get("assets", {})

        # --- RGB ---
        rgb = None
        for key in ("visual", "TCI", "tci"):
            if key in assets:
                rgb = _read_rgb(assets[key]["href"], bbox)
                if rgb is not None:
                    break
        # fallback: composite B04/B03/B02
        if rgb is None:
            bands_rgb = []
            for k in ("B04", "B03", "B02"):
                url = assets.get(k, {}).get("href") or assets.get(k.lower(), {}).get("href")
                b = _read_band(url, bbox) if url else None
                bands_rgb.append(b)
            if all(b is not None for b in bands_rgb):
                stack = np.stack(bands_rgb, axis=-1)
                p2, p98 = np.percentile(stack, (2, 98))
                rgb = np.clip((stack - p2) / (p98 - p2 + 1e-6), 0, 1)
                rgb = (rgb * 255).astype(np.uint8)

        # --- NDWI ---
        ndwi_mask = None
        for k3, k8 in [("B03", "B08"), ("green", "nir"), ("b03", "b08")]:
            url3 = assets.get(k3, {}).get("href")
            url8 = assets.get(k8, {}).get("href")
            if url3 and url8:
                b3 = _read_band(url3, bbox)
                b8 = _read_band(url8, bbox)
                if b3 is not None and b8 is not None:
                    _, ndwi_mask = _ndwi_mask(b3, b8)
                    break

        rgb_list.append(rgb)
        mask_list.append(ndwi_mask)

    # ── Build 2×3 figure ──────────────────────────────────────────────────────
    n = len(SEASONS)
    fig, axes = plt.subplots(2, n, figsize=(n * 4.0, 9.0), facecolor="white",
                             gridspec_kw={"hspace": 0.03, "wspace": 0.03})

    for col, season in enumerate(SEASONS):
        rgb  = rgb_list[col]
        mask = mask_list[col]

        # Top: satellite RGB
        ax = axes[0, col]
        ax.set_title(season["label"], fontsize=10, fontweight="bold",
                     color="#1a1a2e", pad=5)
        ax.axis("off")
        if rgb is not None:
            ax.imshow(rgb, interpolation="bilinear")
            # Sentinel-2 source label
            ax.text(0.02, 0.97, "Sentinel-2 L2A", transform=ax.transAxes,
                    fontsize=7, color="white", va="top",
                    bbox=dict(boxstyle="round,pad=0.2", fc="#0a1628",
                              alpha=0.7, ec="none"))
        else:
            ax.set_facecolor("#111")
            ax.text(0.5, 0.5, "No clear scene\navailable",
                    ha="center", va="center", transform=ax.transAxes,
                    color="#666", fontsize=9)

        # Bottom: NDWI mask
        ax2 = axes[1, col]
        ax2.axis("off")
        if mask is not None:
            ax2.imshow(_mask_rgba(mask), interpolation="nearest")
            cov = mask.mean() * 100
            ax2.text(0.5, 0.025, f"{cov:.1f}% water",
                     transform=ax2.transAxes, fontsize=8, color="#1a3a6e",
                     ha="center", va="bottom",
                     bbox=dict(boxstyle="round,pad=0.25", fc="white",
                               alpha=0.88, ec="#a8c4e0"))
        else:
            ax2.set_facecolor("#ddd")
            ax2.text(0.5, 0.5, "NDWI unavailable", ha="center", va="center",
                     transform=ax2.transAxes, color="#888", fontsize=9)

        # Down arrow
        xc = (col + 0.5) / n
        fig.add_artist(mpatches.FancyArrow(
            xc, 0.505, 0, -0.01, width=0.008, head_width=0.016,
            head_length=0.008, transform=fig.transFigure,
            color="#555", clip_on=False, zorder=30))

        # Label (a/b/c)
        fig.text((col + 0.5) / n, 0.008, f"({season['code']})",
                 ha="center", va="bottom", fontsize=11, color="#222",
                 fontweight="bold", transform=fig.transFigure)

    fig.suptitle(f"Sentinel-2 L2A  ·  {wb_name}",
                 fontsize=11.5, fontweight="bold", color="#0a1628", y=1.005)

    water_p = mpatches.Patch(fc=(0.18, 0.50, 0.83), ec=(0.07, 0.27, 0.62),
                             lw=1, label="Water  (NDWI > 0.1)")
    land_p  = mpatches.Patch(fc=(0.80, 0.80, 0.80), ec="#aaa",
                             lw=0.6, label="Non-water")
    fig.legend(handles=[water_p, land_p], loc="lower center", ncol=2,
               fontsize=8.5, frameon=True, edgecolor="#ddd",
               facecolor="white", bbox_to_anchor=(0.5, -0.04))

    plt.savefig(str(out_path), dpi=150, bbox_inches="tight",
                facecolor="white", pad_inches=0.12)
    plt.close(fig)
    print(f"[OK] → {out_path}")
    return str(out_path)
