"""
shub_generator.py
-----------------
Sentinel Hub API pipeline for AquaWatch.
Fetches real Sentinel-2 L2A via Sentinel Hub Process API as an RGB composite
and NDWI mask, arranged in a 2x3 PNG grid.

Uses 3 selected years (e.g. 2021, 2023, 2025) to satisfy the 2x3 constraint.
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
from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv()

OUT = pathlib.Path(__file__).parent / "outputs" / "shub_seg"
OUT.mkdir(parents=True, exist_ok=True)
SZ = 300
YEARS = [2021, 2023, 2025] # 3 columns for 2x3 grid

# Sentinel Hub requires credentials
SHUB_CLIENT_ID = os.environ.get("SHUB_CLIENT_ID", "")
SHUB_CLIENT_SECRET = os.environ.get("SHUB_CLIENT_SECRET", "")

def _get_shub_token():
    if not SHUB_CLIENT_ID or not SHUB_CLIENT_SECRET:
        return None
    try:
        response = requests.post(
            "https://services.sentinel-hub.com/oauth/token",
            data={"grant_type": "client_credentials"},
            auth=(SHUB_CLIENT_ID, SHUB_CLIENT_SECRET),
            timeout=10
        )
        response.raise_for_status()
        return response.json()["access_token"]
    except Exception as e:
        print(f"[SHUB] Token error: {e}")
        return None

def _fetch_shub_png(year, bbox_wgs84, evalscript, token):
    process_url = "https://services.sentinel-hub.com/api/v1/process"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    min_lon, min_lat, max_lon, max_lat = bbox_wgs84
    
    payload = {
        "input": {
            "bounds": {
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
                "bbox": [min_lon, min_lat, max_lon, max_lat]
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": f"{year}-01-01T00:00:00Z",
                            "to": f"{year}-12-31T23:59:59Z"
                        },
                        "maxCloudCoverage": 20,
                        "mosaickingOrder": "leastCC"
                    }
                }
            ]
        },
        "output": {
            "width": SZ,
            "height": SZ,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}]
        },
        "evalscript": evalscript
    }
    
    res = requests.post(process_url, headers=headers, json=payload, timeout=30)
    res.raise_for_status()
    
    img = Image.open(io.BytesIO(res.content))
    return np.array(img)

def _get_rgb_and_mask(year, bbox, token):
    rgb_eval = """
    //VERSION=3
    function setup() {
        return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4 } };
    }
    const factor = 2.5;
    function evaluatePixel(s) {
        return [factor*s.B04, factor*s.B03, factor*s.B02, s.dataMask];
    }
    """
    
    mask_eval = """
    //VERSION=3
    function setup() {
        return { input: ["B03", "B08", "dataMask"], output: { bands: 4 } };
    }
    function evaluatePixel(s) {
        let ndwi = (s.B03 - s.B08) / (s.B03 + s.B08);
        if (!s.dataMask) { return [0.8, 0.8, 0.8, 1]; } // default no data -> gray
        if (ndwi > 0.1) {
            return [47/255, 129/255, 247/255, 1]; // water blue
        } else {
            return [200/255, 200/255, 200/255, 1]; // land gray
        }
    }
    """
    
    rgb_img  = _fetch_shub_png(year, bbox, rgb_eval, token)
    mask_img = _fetch_shub_png(year, bbox, mask_eval, token)
    
    # calc coverage from the returned png
    # water is [47, 129, 247]
    is_water = (mask_img[:,:,0] == 47) & (mask_img[:,:,1] == 129) & (mask_img[:,:,2] == 247)
    cov = np.sum(is_water) / is_water.size * 100
    
    return rgb_img, mask_img, cov

def generate_shub_grid(wb_id, wb_name, wb_lat, wb_lng, wb_type="river", force=False):
    out_path = OUT / f"{wb_id}.png"
    if out_path.exists() and not force:
        return str(out_path)
        
    token = _get_shub_token()
    if not token:
        # User requested: If credentials missing, do not show error image. Returns None to trigger synthetic fallback.
        return None
        
    pad_lon, pad_lat = 0.08, 0.06
    bbox = [wb_lng - pad_lon, wb_lat - pad_lat, wb_lng + pad_lon, wb_lat + pad_lat]

    n = len(YEARS)
    fig, axes = plt.subplots(2, n, figsize=(n * 4.0, 8.5), facecolor="white", gridspec_kw={"hspace": 0.03, "wspace": 0.03})

    for col, year in enumerate(YEARS):
        print(f"[SHUB] Fetching {wb_name} for {year}...")
        try:
            rgb, mask_vis, cov = _get_rgb_and_mask(year, bbox, token)
        except Exception as e:
            print(f"[SHUB error {year}] {e}")
            rgb, mask_vis, cov = None, None, 0
            
        # Top: RGB
        ax = axes[0, col]
        ax.set_title(f"{year}", fontsize=11, fontweight="bold", color="#1a1a2e", pad=6)
        ax.axis("off")
        if rgb is not None:
             ax.imshow(rgb)
             ax.text(0.02, 0.97, "Sentinel-2 L2A (Sentinel Hub)", transform=ax.transAxes,
                    fontsize=7, color="white", va="top",
                    bbox=dict(boxstyle="round,pad=0.2", fc="#0a1628", alpha=0.7, ec="none"))
        else:
             ax.set_facecolor("#111")
             ax.text(0.5, 0.5, "No clear scene", ha="center", va="center", color="#fff")
             
        # Bottom: Mask
        ax2 = axes[1, col]
        ax2.axis("off")
        if mask_vis is not None:
             ax2.imshow(mask_vis)
             ax2.text(0.5, 0.03, f"{cov:.1f}% water", transform=ax2.transAxes, 
                      fontsize=8, color="#1a3a6e", ha="center", va="bottom",
                      bbox=dict(boxstyle="round,pad=0.25", fc="white", alpha=0.88, ec="#a8c4e0"))
        else:
             ax2.set_facecolor("#ddd")
             ax2.text(0.5, 0.5, "No clear scene", ha="center", va="center", color="#333")

    fig.suptitle(f"Sentinel Hub API  ·  {wb_name}", fontsize=12, fontweight="bold", color="#0a1628", y=1.0)
                 
    # Legend
    water_p = mpatches.Patch(fc=(47/255, 129/255, 247/255), label="Water (NDWI > 0.1)")
    land_p  = mpatches.Patch(fc=(200/255, 200/255, 200/255), label="Non-water")
    fig.legend(handles=[water_p, land_p], loc="lower center", ncol=2, 
               fontsize=9, bbox_to_anchor=(0.5, -0.05), frameon=True)

    plt.savefig(str(out_path), dpi=150, bbox_inches="tight", facecolor="white", pad_inches=0.1)
    plt.close(fig)
    print(f"[SHUB] OK → {out_path}")
    return str(out_path)
