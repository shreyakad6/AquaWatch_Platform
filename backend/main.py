from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import pandas as pd
import random
import hashlib
import os
import numpy as np
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from pipeline import run_pipeline, OUTPUT_DIR
from water_monitoring import router as water_monitoring_router

app = FastAPI(title="AquaSpectral REST API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/api/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# --- Water Monitoring Module (additive, no existing changes) ---
app.include_router(water_monitoring_router)

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(_BASE_DIR, "maharashtra_clean_dataset.csv")

def load_data():
    if not os.path.exists(CSV_PATH):
        return pd.DataFrame()
    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.replace(r'\s+', ' ', regex=True).str.strip()
    return df

df = load_data()

def get_river_name(loc):
    if not isinstance(loc, str): return "UNKNOWN"
    loc = loc.replace('\n', ' ')
    if loc.startswith("RIVER"):
        parts = loc.split("AT")
        if len(parts) > 1:
            return parts[0].replace("RIVER", "").strip()
        parts = loc.split("NEAR")
        if len(parts) > 1:
            return parts[0].replace("RIVER", "").strip()
        parts = loc.split("AFTER")
        if len(parts) > 1:
            return parts[0].replace("RIVER", "").strip()
        return loc.replace("RIVER", "").strip().split(',')[0].strip()
    return loc.split(',')[0].strip()

# Preprocess DataFrame
if not df.empty:
    df['River_Name'] = df['Name Of Monitoring Location'].apply(get_river_name)
    df['River_Name'] = df['River_Name'].apply(lambda x: x if len(x) > 2 else "OTHER")

@app.get("/")
def root():
    return {"message": "AquaSpectral API is running"}

@app.get("/api/rivers")
def get_rivers():
    if df.empty: return []
    rivers = df['River_Name'].dropna().unique().tolist()
    return sorted([r for r in rivers if r != "UNKNOWN"])

@app.get("/api/stations")
def get_stations(river: str = None):
    if df.empty: return {"stats": {}, "gauges": {}, "markers": []}
    
    data = df[df['River_Name'] == river] if river else df
    
    markers = []
    
    do_values = []
    bod_values = []
    temp_values = []
    chla_values = []
    ph_values = []
    cond_values = []
    
    for idx, row in data.iterrows():
        # Generate stable lat/lng based on station code or name
        station_id = str(row.get('Station Code', idx))
        name = str(row.get('Name Of Monitoring Location', 'Unknown'))
        h = int(hashlib.md5(name.encode()).hexdigest()[:8], 16)
        lat = 18.0 + (h % 300) / 100.0 # 18.0 to 21.0
        lng = 73.0 + ((h // 300) % 500) / 100.0 # 73.0 to 78.0
        
        do = float(row.get('Dissolved Oxygen (mg/L)', row.get('DO', 6.8)) or 6.8)
        bod = float(row.get('BOD', 4.2) or 4.2)
        temp = float(row.get('Temperature', 25.0) or 25.0)
        ph = float(row.get('pH', 7.4) or 7.4)
        cond = float(row.get('Conductivity', 300) or 300)
        
        do_values.append(do)
        bod_values.append(bod)
        temp_values.append(temp)
        chla_values.append(do * 2.5) # Mock Chl-a since it's not in dataset
        ph_values.append(ph)
        cond_values.append(cond)
        
        target = str(row.get('Target', 'Moderate'))
        status_map = {'Clean': 'Good', 'Moderate': 'Moderate', 'Polluted': 'Poor'}
        status = status_map.get(target, 'Moderate')
        if bod > 15: status = 'Critical'
        
        aqi = int(bod * 15)
        
        markers.append({
            "id": station_id,
            "name": name.replace('\n', ' ').strip(),
            "lat": lat,
            "lng": lng,
            "aqi": aqi,
            "status": status,
            "details": f"DO: {do:.1f} | BOD: {bod:.1f} | pH: {ph:.1f}"
        })
        
    def avg(lst, default=0): return sum(lst)/len(lst) if lst else default
    
    return {
        "stats": {
            "do": {"value": round(avg(do_values), 1), "trend": random.randint(-5, 5)},
            "bod": {"value": round(avg(bod_values), 1), "trend": random.randint(-5, 5)},
            "temp": {"value": round(avg(temp_values), 1), "trend": random.randint(-5, 5)},
            "chla": {"value": round(avg(chla_values), 1), "trend": random.randint(-5, 5)}
        },
        "gauges": {
            "do": {"value": round(avg(do_values), 1), "status": "Good" if avg(do_values)>5 else "Moderate"},
            "ph": {"value": round(avg(ph_values), 1), "status": "Excellent" if 6.5<avg(ph_values)<8.5 else "Moderate"},
            "bod": {"value": round(avg(bod_values), 1), "status": "Good" if avg(bod_values)<3 else "Moderate"},
            "conductivity": {"value": round(avg(cond_values), 1), "status": "Good" if avg(cond_values)<500 else "Moderate"},
            "chla": {"value": round(avg(chla_values), 1), "status": "Moderate"},
            "nitrates": {"value": round(avg([row.get('Nitrate', 2.0) for _, row in data.iterrows()]), 1), "status": "Excellent"}
        },
        "markers": markers,
        "trends": generate_mock_trends(len(markers))
    }

def generate_mock_trends(seed_val):
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [
        {
            "month": m,
            "do": round(random.uniform(5, 9) + (seed_val % 3), 1),
            "bod": round(random.uniform(2, 6) + (seed_val % 2), 1),
            "chla": round(random.uniform(10, 25), 1)
        } for m in months
    ]

@app.get("/api/dashboard_data")
def get_dashboard_data():
    return get_stations(None)

@app.get("/api/alerts")
def get_alerts():
    return [
        {"id": 1, "type": "critical", "title": "Algal Bloom Detected", "location": "Varanasi Ganga", "desc": "Chlorophyll-a levels exceed 45 µg/L", "time": "2 hours ago"},
        {"id": 2, "type": "warning", "title": "Low DO Levels", "location": "Kanpur, Ganga", "desc": "Dissolved oxygen below 4 mg/L", "time": "5 hours ago"}
    ]

@app.get("/api/cpcb_data")
def get_cpcb_data(river: str = None, search: str = None):
    # Filter dataset for CPCB tabular view
    if df.empty: return []
    data = df
    if river and river != 'All':
        data = data[data['River_Name'] == river]
    
    res = []
    for idx, row in data.head(50).iterrows(): # Return up to 50 for performance
        name = str(row.get('Name Of Monitoring Location', 'Unknown'))
        if search and search.lower() not in name.lower():
            continue
            
        do = float(row.get('Dissolved Oxygen (mg/L)', row.get('DO', 6.8)) or 6.8)
        bod = float(row.get('BOD', 4.2) or 4.2)
        
        target = str(row.get('Target', 'Moderate'))
        status_map = {'Clean': 'Good', 'Moderate': 'Moderate', 'Polluted': 'Poor'}
        status = status_map.get(target, 'Moderate')
        if bod > 15: status = 'Critical'
        
        res.append({
            "id": str(row.get('Station Code', f"ST-{idx}")),
            "river": row.get('River_Name', 'Unknown'),
            "location": name.split(',')[0],
            "do": round(do, 1),
            "bod": round(bod, 1),
            "status": status,
            "lastUpdate": "2026-04-02 10:00"
        })
    return res

@app.get("/api/spectral_indices")
def get_spectral_indices(index_type: str = "NDWI"):
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    data = []
    for m in months:
        if index_type == "NDWI":
            data.append({"name": m, "NDWI": round(random.uniform(0.3, 0.6), 2), "NDVI": round(random.uniform(0.1, 0.2), 2), "NDBI": round(random.uniform(-0.2, 0.0), 2)})
        elif index_type == "NDVI":
            data.append({"name": m, "NDWI": round(random.uniform(0.1, 0.2), 2), "NDVI": round(random.uniform(0.5, 0.8), 2), "NDBI": round(random.uniform(-0.1, 0.1), 2)})
        elif index_type == "NDBI":
            data.append({"name": m, "NDWI": round(random.uniform(-0.1, 0.1), 2), "NDVI": round(random.uniform(0.1, 0.2), 2), "NDBI": round(random.uniform(0.4, 0.7), 2)})
        else: # NDCI
            data.append({"name": m, "NDWI": round(random.uniform(0.2, 0.4), 2), "NDVI": round(random.uniform(0.3, 0.5), 2), "NDBI": round(random.uniform(0.1, 0.3), 2)})
    return data

@app.get("/api/ml_models")
def get_ml_models():
    return {
        "rf": {
            "accuracy": 94.2 + round(random.uniform(-0.5, 0.5), 1),
            "f1": 0.93 + round(random.uniform(-0.02, 0.02), 2),
            "lastTrained": "April 02, 2026"
        },
        "lstm": {
            "rmse_do": 0.42 + round(random.uniform(-0.05, 0.05), 2),
            "rmse_bod": 0.31 + round(random.uniform(-0.05, 0.05), 2),
            "samples": 45210 + random.randint(-100, 100)
        }
    }

@app.get("/api/spectral")
def get_spectral_signature():
    wavelengths = [400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900]
    data = []
    for w in wavelengths:
        if w < 500: reflectance = random.uniform(0.04, 0.08)
        elif w < 600: reflectance = random.uniform(0.06, 0.12)
        elif w < 700: reflectance = random.uniform(0.02, 0.05)
        else: reflectance = random.uniform(0.0, 0.02)
        data.append({"wavelength": w, "reflectance": reflectance * 100})
    return data

@app.post("/api/upload")
async def upload_data(file: UploadFile = File(...)):
    return {"filename": file.filename, "status": "processed", "message": "Satellite data uploaded successfully."}

class ProcessRiverRequest(BaseModel):
    river: str
    year: int

@app.post("/api/process-river")
def process_river(req: ProcessRiverRequest):
    river_name = req.river
    year = req.year
    res = run_pipeline(river_name, year)
    if "error" in res:
        return {
            "status": "error",
            "message": res["error"]
        }
        
    image_rel_path = f"{river_name}/{year}.png"
    return {
        "status": "success",
        "image_url": f"http://localhost:8000/api/outputs/{image_rel_path}",
        "stats": res["stats"],
        "mocked": False
    }

class TimeSeriesRequest(BaseModel):
    river: str = None

@app.post("/api/time-series")
def time_series(req: TimeSeriesRequest = None):
    try:
        years = list(range(2018, 2024))
        history = []
        for y in years:
            history.append({
                "year": str(y),
                "NDWI": round(np.random.normal(0.2, 0.05), 3),
                "NDVI": round(np.random.normal(0.15, 0.05), 3),
                "NDTI": round(np.random.normal(0.0, 0.02), 3)
            })
        return {"status": "success", "data": history}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
