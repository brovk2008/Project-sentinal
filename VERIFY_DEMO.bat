@echo off
title Project Sentinel Demo Verification Control
cls
echo ===================================================
echo Project Sentinel Demo Verification Control
echo ===================================================
echo.

setlocal enabledelayedexpansion
set "FAILED_CHECKS=0"

echo [1/5] Verifying PostgreSQL Database Connection...
docker inspect -f "{{.State.Running}}" sentinel_postgres 2>nul | findstr "true" >nul
if %errorlevel% neq 0 (
    echo [ERROR] PostgreSQL docker container 'sentinel_postgres' is NOT running.
    set /a FAILED_CHECKS+=1
) else (
    docker exec sentinel_postgres psql -U postgres -d sentinel_db -c "SELECT 1;" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] Could not query sentinel_db inside the container.
        set /a FAILED_CHECKS+=1
    ) else (
        echo [OK] PostgreSQL is active and queryable.
    )
)
echo.

echo [2/5] Verifying Ollama Daemon and Model...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo [ERROR] Ollama daemon is NOT running at http://127.0.0.1:11434.
    set /a FAILED_CHECKS+=1
) else (
    echo [OK] Ollama daemon is active.
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing; if ($r.Content -like '*qwen2.5:1.5b*') { exit 0 } else { exit 1 } } catch { exit 1 }"
    if !errorlevel! neq 0 (
        echo [ERROR] Model qwen2.5:1.5b is NOT loaded or available in Ollama.
        set /a FAILED_CHECKS+=1
    ) else (
        echo [OK] Model qwen2.5:1.5b is available.
    )
)
echo.

echo [3/5] Verifying FastAPI Backend API...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo [ERROR] FastAPI backend is NOT running at http://127.0.0.1:8000/.
    set /a FAILED_CHECKS+=1
) else (
    echo [OK] FastAPI backend is responsive on port 8000.
)
echo.

echo [4/5] Verifying Cloudflare Tunnel...
if not exist cloudflare_tunnel.log (
    echo [ERROR] cloudflare_tunnel.log not found. Tunnel may not be running.
    set /a FAILED_CHECKS+=1
) else (
    set "TUNNEL_URL="
    for /f "tokens=*" %%i in ('powershell -Command "[regex]::Match((Get-Content cloudflare_tunnel.log | Out-String), 'https://[a-zA-Z0-9-]+\.trycloudflare\.com').Value" 2^>nul') do set TUNNEL_URL=%%i
    if "!TUNNEL_URL!"=="" (
        echo [ERROR] Could not extract trycloudflare.com URL from cloudflare_tunnel.log.
        set /a FAILED_CHECKS+=1
    ) else (
        echo [OK] Cloudflare tunnel is active: !TUNNEL_URL!
    )
)
echo.

echo [5/5] Checking RAG Health Endpoint...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/v1/intelligence/health' -UseBasicParsing -TimeoutSec 3; if ($r.Content -like '*healthy*' -and $r.Content -like '*available*') { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo [ERROR] Health check endpoint returned unhealthy or Ollama is offline.
    set /a FAILED_CHECKS+=1
) else (
    echo [OK] RAG Health Endpoint reports status: healthy and LLM: available.
)
echo.

echo ===================================================
if %FAILED_CHECKS% gtr 0 (
    echo STATUS: FAIL (!FAILED_CHECKS! check(s) failed. Please run START_DEMO.bat or review logs.)
) else (
    echo STATUS: SUCCESS (All systems green and warmed up!)
)
echo ===================================================
pause
