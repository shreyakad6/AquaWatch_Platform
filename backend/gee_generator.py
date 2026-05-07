"""
gee_generator.py
----------------
Google Earth Engine pipeline for AquaWatch.
Fetches real Sentinel-2 L2A composites (cloud masked) and NDWI directly
from GEE as a 2x3 PNG grid.

Years used for the 3 columns: 2021, 2023, 2025.
"""

import os
import pathlib
import io
import requests
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from PIL import Image

# Initialize EE
import ee
try:
    ee.Initialize()
    _EE_READY = True
except Exception as e:
    print(f"[GEE] Not authenticated: {e}")
    _EE_READY = False

OUT = pathlib.Path(__file__).parent / "outputs" / "gee_seg"
OUT.mkdir(parents=True, exist_ok=True)
SZ = 300

YEARS = [2021, 2023, 2025] # 3 columns for a 2x3 grid

def _mask_s2_clouds(image):
    """QA60 Cloud and Cirrus mask."""
    qa = image.select("QA60")
    cloudBitMask = 1 << 10
    cirrusBitMask = 1 << 11
    mask = qa.bitwiseAnd(cloudBitMask).eq(0).And(qa.bitwiseAnd(cirrusBitMask).eq(0))
    return image.updateMask(mask).divide(10000)

def _get_image_gee(year, roi):
    collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED") \
        .filterBounds(roi) \
        .filterDate(f"{year}-01-01", f"{year}-12-31") \
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20)) \
        .map(_mask_s2_clouds)
        
    composite = collection.median().clip(roi)
    
    ndwi = composite.normalizedDifference(["B3", "B8"]).rename("NDWI")
    water_mask = ndwi.gt(0.1) # Threshold > 0.1
    water_only = water_mask.updateMask(water_mask)
    
    rgb_url = composite.select(["B4", "B3", "B2"]).getThumbURL({
        "min": 0, "max": 0.3,
        "dimensions": SZ,
        "region": roi, "format": "png"
    })
    
    mask_url = water_only.getThumbURL({
        "min": 1, "max": 1,
        "palette": ["2f81f7"], # water color
        "dimensions": SZ,
        "region": roi, "format": "png"
    })
    
    # Download as PIL Images
    req_rgb = requests.get(rgb_url, timeout=30)
    req_mask = requests.get(mask_url, timeout=30)
    
    rgb_img = np.array(Image.open(io.BytesIO(req_rgb.content)).convert("RGB"))
    mask_rgba = np.array(Image.open(io.BytesIO(req_mask.content)).convert("RGBA"))
    
    # Create final mask visualization: light gray for land, blue for water
    viz_mask = np.full((mask_rgba.shape[0], mask_rgba.shape[1], 3), 200, dtype=np.uint8)
    is_water = mask_rgba[:, :, 3] > 0
    viz_mask[is_water] = [47, 129, 247]
    
    coverage = np.sum(is_water) / is_water.size * 100
    return rgb_img, viz_mask, coverage


def generate_gee_grid(wb_id, wb_name, wb_lat, wb_lng, wb_type="river", force=False):
    out_path = OUT / f"{wb_id}.png"
    if out_path.exists() and not force:
        return str(out_path)
        
    if not _EE_READY:
        return None
        
    pad_lon, pad_lat = 0.08, 0.06
    roi = ee.Geometry.BBox(
        wb_lng - pad_lon, wb_lat - pad_lat,
        wb_lng + pad_lon, wb_lat + pad_lat
    )

    n = len(YEARS)
    fig, axes = plt.subplots(2, n, figsize=(n * 4.0, 8.5), facecolor="white", gridspec_kw={"hspace": 0.03, "wspace": 0.03})

    for col, year in enumerate(YEARS):
        print(f"[GEE] Fetching {wb_name} for {year}...")
        try:
            rgb, mask_vis, cov = _get_image_gee(year, roi)
        except Exception as e:
            print(f"[GEE error {year}] {e}")
            rgb, mask_vis, cov = None, None, 0
            
        # Top: RGB
        ax = axes[0, col]
        ax.set_title(f"{year}", fontsize=11, fontweight="bold", color="#1a1a2e", pad=6)
        ax.axis("off")
        if rgb is not None:
             ax.imshow(rgb)
             ax.text(0.02, 0.97, "Sentinel-2 L2A (GEE)", transform=ax.transAxes,
                    fontsize=7, color="white", va="top",
                    bbox=dict(boxstyle="round,pad=0.2", fc="#0a1628", alpha=0.7, ec="none"))
        else:
             ax.set_facecolor("#111")
             ax.text(0.5, 0.5, "Extraction Failed", ha="center", va="center", color="#fff")
             
        # Bottom: Mask
        ax2 = axes[1, col]
        ax2.axis("off")
        if mask_vis is not None:
             ax2.imshow(mask_vis)
             ax2.text(0.5, 0.03, f"{cov:.1f}% water", transform=ax2.transAxes, 
                      fontsize=8, color="#1a3a6e", ha="center", va="bottom",
                      bbox=dict(boxstyle="round,pad=0.25", fc="white", alpha=0.88, ec="#a8c4e0"))
             
             # Draw the blue contour for border outline to match styling
        else:
             ax2.set_facecolor("#ddd")
             ax2.text(0.5, 0.5, "Extraction Failed", ha="center", va="center", color="#333")

    fig.suptitle(f"Google Earth Engine · Sentinel-2  ·  {wb_name}",
                 fontsize=12, fontweight="bold", color="#0a1628", y=1.0)
                 
    # Legend
    water_p = mpatches.Patch(fc=(47/255, 129/255, 247/255), label="Water (NDWI > 0.1)")
    land_p  = mpatches.Patch(fc=(200/255, 200/255, 200/255), label="Non-water (Cloud Masked)")
    fig.legend(handles=[water_p, land_p], loc="lower center", ncol=2, 
               fontsize=9, bbox_to_anchor=(0.5, -0.05), frameon=True)

    plt.savefig(str(out_path), dpi=150, bbox_inches="tight", facecolor="white", pad_inches=0.1)
    plt.close(fig)
    print(f"[GEE] OK → {out_path}")
    return str(out_path)
