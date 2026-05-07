# AquaWatch ML Platform

A comprehensive, full-stack machine learning platform for monitoring water quality and analyzing spectral data using satellite imagery.

## 🌟 Key Features
- **Modern Glassmorphism Dashboard**: A dark-themed, sleek UI featuring interactive elements and responsive design.
- **FastAPI Backend**: Rapid, high-performance REST APIs structured for machine learning inference.
- **Advanced Machine Learning**: Integrations for RandomForest, XGBoost, CNNs, and LSTMs to classify water and forecast time-series data.
- **Interactive Maps & Real-time Charts**: Built-in Leaflet maps and Recharts for clear data visualization.
- **Custom Computed Indices**: Calculates NDWI, NDBI, NDVI, NDCI+, and more for deep water analysis.

## 🚀 Technology Stack
- **Frontend**: React, Vite, Recharts, React-Leaflet, Vanilla CSS (dynamic, custom tokens).
- **Backend**: Python, FastAPI, Uvicorn.
- **Data & ML**: Scikit-Learn, TensorFlow, OpenCV, Rasterio.

## 📦 Installation & Running Locally

### 1. Setup Backend
Navigate to the `backend` directory and set up a virtual environment:

```bash
cd backend
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python main.py
```
*The API will be available at import.meta.env.VITE_API_URL*

### 2. Setup Frontend
In a new terminal, navigate to the `frontend` directory and install the packages:

```bash
cd frontend
npm install
npm run dev
```
*The Dashboard will be running at `http://localhost:5173`*

## 🧑‍💻 Usage
1. Review the generated map highlighting sample water stations.
2. Observe time-series trends (chlorophyll and turbidity) mapped by the LSTM forecasting models.
3. Click **"Upload Data"** via the top right action button to test file uploading through FastAPI (satellite data processing simulation).

---
*Optimized for predictive accuracy, scalable deployment, and robust UI/UX.*
