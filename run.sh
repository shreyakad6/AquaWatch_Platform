#!/bin/bash
echo "=============================================="
echo "🌊 AquaWatch Full Stack One-Command Setup"
echo "=============================================="

echo "[1/2] Starting Backend (FastAPI)..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
echo "Installing dependencies..."
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "[2/2] Starting Frontend (React/Vite)..."
cd ../frontend
echo "Installing npm packages..."
npm install
npm run dev &
FRONTEND_PID=$!

echo "=============================================="
echo "✅ Deployment initiated!"
echo "Frontend running at: http://localhost:5173"
echo "Backend API running at: import.meta.env.VITE_API_URL"
echo "Press Ctrl+C to stop both servers."
echo "=============================================="

trap "kill $BACKEND_PID $FRONTEND_PID" SIGINT
wait
