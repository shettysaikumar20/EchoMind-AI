@echo off
title EchoMind AI Launcher
echo ========================================================
echo          EchoMind AI - Starting Services
echo ========================================================
echo.

set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

echo [1/3] Checking Backend environment...
if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment not found at backend\venv!
    echo Please make sure backend\venv is installed.
    pause
    exit /b 1
)

echo [2/3] Starting EchoMind Backend (FastAPI + Uvicorn on http://127.0.0.1:8000)...
start "EchoMind AI - Backend" cmd /k "cd /d "%ROOT_DIR%backend" && title EchoMind Backend (Port 8000) && .\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Starting EchoMind Frontend (Vite on http://127.0.0.1:5173)...
start "EchoMind AI - Frontend" cmd /k "cd /d "%ROOT_DIR%frontend" && title EchoMind Frontend (Port 5173) && npm run dev"

echo.
echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening browser at http://localhost:5173 ...
start http://localhost:5173

echo.
echo ========================================================
echo   EchoMind AI is running!
echo   Frontend : http://localhost:5173
echo   Backend  : http://127.0.0.1:8000/api
echo   API Docs : http://127.0.0.1:8000/docs
echo ========================================================
echo Press any key to close this launcher window (services keep running).
pause >nul
