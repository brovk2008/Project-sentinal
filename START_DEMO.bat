@echo off
title Project Sentinel Demo Startup Control
cls
echo ===================================================
echo Project Sentinel Demo Startup Control
echo ===================================================
echo.

echo [1/5] Checking Docker & PostgreSQL Container...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not running. Attempting to start Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker daemon to initialize...
    :docker_wait
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo . (Still waiting for Docker...)
        goto docker_wait
    )
    echo Docker started successfully.
) else (
    echo Docker daemon is running.
)

docker inspect -f "{{.State.Running}}" sentinel_postgres >nul 2>&1
if %errorlevel% neq 0 (
    echo PostgreSQL container sentinel_postgres not found. Launching via docker-compose...
    docker-compose up -d db
) else (
    echo Starting PostgreSQL container...
    docker start sentinel_postgres >nul 2>&1
)
echo Waiting 3 seconds for PostgreSQL to initialize...
timeout /t 3 /nobreak >nul

echo.
echo [2/5] Checking Ollama daemon...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo Ollama daemon is not running at http://127.0.0.1:11434.
    echo Starting Ollama serve in background...
    start "Ollama Server" /min cmd /c "ollama serve"
    echo Waiting for Ollama to bind to port 11434...
    :ollama_wait
    timeout /t 2 /nobreak >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
    if %errorlevel% neq 0 (
        echo . (Waiting for Ollama...)
        goto ollama_wait
    )
)
echo Ollama daemon detected.

echo Checking qwen2.5:1.5b model...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing; if ($r.Content -like '*qwen2.5:1.5b*') { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo WARNING: qwen2.5:1.5b model not found in Ollama. Pulling model...
    ollama pull qwen2.5:1.5b
) else (
    echo Model qwen2.5:1.5b verified.
)

echo.
echo [3/5] Launching FastAPI Backend with Warmup...
set DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/sentinel_db
set OLLAMA_URL=http://127.0.0.1:11434
set PORT=8000
set ENV=development
set DEMO_MODE=true
set WARMUP_LLM=true

rem Start backend in a separate minimized cmd window
start "Project Sentinel Backend" cmd /k "title Project Sentinel Backend && python backend/main.py"
echo Backend startup initiated. Waiting 5 seconds for cache preheating...
timeout /t 5 /nobreak >nul

echo.
echo [4/5] Starting Cloudflare Quick Tunnel...
if exist cloudflare_tunnel.log del cloudflare_tunnel.log
start "Cloudflare Tunnel" /min cmd /c "title Cloudflare Tunnel && C:\Users\techp\scoop\shims\cloudflared.exe tunnel --url http://127.0.0.1:8000 > cloudflare_tunnel.log 2>&1"

echo Waiting for Cloudflare Tunnel to generate public URL...
set "TUNNEL_URL="
set "COUNTER=0"

:poll_loop
powershell -Command "if (Select-String -Path 'cloudflare_tunnel.log' -Pattern 'https://.*trycloudflare\.com') { exit 0 } else { exit 1 }" 2>nul
if %errorlevel% eq 0 (
    goto get_url
)
set /a COUNTER+=1
if %COUNTER% gtr 30 (
    echo.
    echo ERROR: Timeout waiting for Cloudflare Tunnel URL. Please check cloudflare_tunnel.log.
    pause
    exit /b 1
)
echo . (Waiting %COUNTER%/30)
timeout /t 1 /nobreak >nul
goto :poll_loop

:get_url
for /f "tokens=*" %%i in ('powershell -Command "[regex]::Match((Get-Content cloudflare_tunnel.log | Out-String), 'https://[a-zA-Z0-9-]+\.trycloudflare\.com').Value"') do set TUNNEL_URL=%%i

if "%TUNNEL_URL%"=="" (
    echo Could not parse tunnel URL. Check cloudflare_tunnel.log
    pause
    exit /b 1
)

echo.
echo [5/5] Copying public tunnel URL to clipboard...
echo | set /p="%TUNNEL_URL%" | clip
echo URL copied! Use this for configuring your frontend.

echo ===================================================
echo SUCCESS: Project Sentinel Backend is Live!
echo ===================================================
echo Local API Endpoint: http://127.0.0.1:8000
echo Public Tunnel URL:  %TUNNEL_URL%
echo ===================================================
echo.
echo To stop the demo, run: STOP_DEMO.bat
pause
