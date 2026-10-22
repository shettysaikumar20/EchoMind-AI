@echo off
title EchoMind AI Stopper
echo ========================================================
echo          EchoMind AI - Stopping Services
echo ========================================================
echo.

echo Freeing Port 8000 (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a 2>nul
)

echo Freeing Port 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo All EchoMind AI services have been stopped.
timeout /t 2 /nobreak >nul
