from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import geopandas as gpd
import osmnx as ox
import ee
import geemap
import os
import joblib
import numpy as np
import re
import json
from pipeline import run_pipeline, OUTPUT_DIR
from flask import send_from_directory

app = Flask(__name__)
CORS(app)

# Load ML Model
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'pollution_model.pkl')
if os.path.exists(MODEL_PATH):
    ml_model = joblib.load(MODEL_PATH)
else:
    ml_model = None

DATASET_PATH = os.path.join(os.path.dirname(__file__), '..', 'maharashtra_clean_dataset.csv')

def clean_columns(df):
    df.columns = [re.sub(r'\s+', ' ', col).strip() for col in df.columns]
    return df

@app.route('/api/load-rivers', methods=['GET'])
def load_rivers():
    try:
        df = pd.read_csv(DATASET_PATH, on_bad_lines='skip')
        df = clean_columns(df)
        
        # 'Name Of Monitoring Location' has newlines and extra spaces
        if 'Name Of Monitoring Location' in df.columns:
            locations = df['Name Of Monitoring Location'].dropna().astype(str).tolist()
            # Clean names
            clean_names = []
            for loc in locations:
                name = re.sub(r'\s+', ' ', loc).strip()
                # Try to extract the river name, e.g., "RIVER TAPI AT AJNAD..."
                if "RIVER" in name.upper():
                    # Extract roughly the first few words or the whole cleaned thing if short
                    match = re.search(r'RIVER\s+([A-Za-z]+)', name.upper())
                    if match:
                        clean_names.append(match.group(1).capitalize())
                    else:
                        clean_names.append(name.split(',')[0])
                else:
                    clean_names.append(name.split(',')[0])
            
            # Get unique and sort
            unique_rivers = sorted(list(set(clean_names)))
            return jsonify({"status": "success", "data": unique_rivers})
        else:
            return jsonify({"status": "error", "message": "Column 'Name Of Monitoring Location' not found."}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/outputs/<path:filename>')
def serve_output(filename):
    return send_from_directory(OUTPUT_DIR, filename)

@app.route('/api/process-river', methods=['POST'])
def process_river():
    data = request.json
    river_name = data.get('river', 'Godavari')
    year = data.get('year', 2023)
    
    # Run the offline pipeline
    res = run_pipeline(river_name, year)
    
    if "error" in res:
        # If EE fails or is not authenticated, we can provide a mock image URL and mock stats to keep UI working
        print("Pipeline Error:", res["error"])
        
        # MOCK FALLBACK
        mock_stats = {
            "NDWI_mean": np.random.normal(0.2, 0.1),
            "NDVI_mean": np.random.normal(0.15, 0.1),
            "Chlorophyll_mean": np.random.normal(0.04, 0.02),
            "Cyanobacteria_mean": np.random.normal(-0.02, 0.05),
            "Carbon_mean": np.random.normal(0.03, 0.01)
        }
        
        # Generate a dummy plot for mock fallback
        import matplotlib.pyplot as plt
        import os
        os.makedirs(os.path.join(OUTPUT_DIR, river_name), exist_ok=True)
        fallback_img = os.path.join(OUTPUT_DIR, river_name, f"{year}_mock.png")
        fig, ax = plt.subplots(figsize=(6,4))
        ax.text(0.5, 0.5, f"EE Not Authenticated\nMock Data for {river_name}\nYear {year}", 
                ha='center', va='center', fontsize=12)
        ax.axis('off')
        plt.savefig(fallback_img, bbox_inches='tight')
        plt.close()
        
        return jsonify({
            "status": "success",
            "image_url": f"http://127.0.0.1:5000/api/outputs/{river_name}/{year}_mock.png",
            "stats": mock_stats,
            "mocked": True,
            "message": "Used mock data due to pipeline error."
        })
        
    # Return success with the URL to the saved PNG
    image_rel_path = f"{river_name}/{year}.png"
    return jsonify({
        "status": "success",
        "image_url": f"http://127.0.0.1:5000/api/outputs/{image_rel_path}",
        "stats": res["stats"],
        "mocked": False
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    vals = data.get('values', {})
    if not ml_model:
        return jsonify({"status": "error", "message": "Model not trained yet."}), 500
        
    try:
        # Expected features: NDWI, NDVI, NDTI, Chlorophyll, Cyanobacteria, Carbon
        features = [[
            vals.get('NDWI', 0),
            vals.get('NDVI', 0),
            vals.get('NDTI', 0),
            vals.get('Chlorophyll', 0),
            vals.get('Cyanobacteria', 0),
            vals.get('Carbon', 0)
        ]]
        
        prediction = ml_model.predict(features)[0]
        # Return probability array if possible
        probs = ml_model.predict_proba(features)[0]
        classes = ml_model.classes_
        
        confidences = {c: float(p) for c, p in zip(classes, probs)}
        
        return jsonify({"status": "success", "prediction": prediction, "confidences": confidences})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/time-series', methods=['POST'])
def time_series():
    try:
        # Mocking time-series historical data for the chart to return fast
        data = request.json
        years = list(range(2018, 2024))
        history = []
        for y in years:
            history.append({
                "year": str(y),
                "NDWI": round(np.random.normal(0.2, 0.05), 3),
                "NDVI": round(np.random.normal(0.15, 0.05), 3),
                "NDTI": round(np.random.normal(0.0, 0.02), 3)
            })
        return jsonify({"status": "success", "data": history})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
