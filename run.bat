@echo off
echo ==============================================
echo 🌊 AquaWatch Full Stack One-Command Setup
echo ==============================================

echo [1/2] Starting Backend (FastAPI)...
cd backend
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
echo Installing dependencies...
pip install -r requirements.txt
start "AquaWatch Backend" cmd /c "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting Frontend (React/Vite)...
cd ..\frontend
echo Installing npm packages...
call npm install
start "AquaWatch Frontend" cmd /c "npm run dev"

echo ==============================================
echo ✅ Deployment initiated! 
echo Frontend running at: http://localhost:5173
echo Backend API running at: http://localhost:8000
echo ==============================================
