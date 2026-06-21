@echo off
title Project Sentinel Demo Stop Control
cls
echo ===================================================
echo Project Sentinel Demo Shutdown Control
echo ===================================================
echo.

echo [1/3] Terminating FastAPI Backend...
taskkill /FI "WINDOWTITLE eq Project Sentinel Backend*" /T /F >nul 2>&1
echo FastAPI backend window terminated.

echo.
echo [2/3] Terminating Cloudflare Tunnel...
taskkill /FI "WINDOWTITLE eq Cloudflare Tunnel*" /T /F >nul 2>&1
taskkill /IM cloudflared.exe /F >nul 2>&1
echo Cloudflare Tunnel terminated.

echo.
echo [3/3] Stopping PostgreSQL Docker Container...
docker-compose down
echo Database container stopped.

echo.
echo ===================================================
echo Project Sentinel Demo is completely shut down.
echo ===================================================
timeout /t 3 /nobreak >nul
