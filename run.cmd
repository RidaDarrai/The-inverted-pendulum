@echo off
setlocal
cd /d "%~dp0"

set PY=python
where python >nul 2>nul || set PY=py

set USECURL=1
where curl >nul 2>nul || set USECURL=0

where uv >nul 2>nul
if %errorlevel%==0 (
    echo [run] starting FastAPI backend on http://localhost:8000/ ...
    pushd backend
    start "inverted-pendulum server" /min uv run uvicorn server:app --port 8000
    popd
) else (
    echo [run] uv not found, serving files with %PY% on http://localhost:8000/ ...
    start "inverted-pendulum server" /min %PY% -m http.server 8000
)

echo [run] waiting for the server ...
set /a tries=0

:wait
set /a tries+=1
if %tries% gtr 90 goto failed

if "%USECURL%"=="1" (
    curl -s -o nul --max-time 2 http://localhost:8000/index.html
) else (
    powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8000); $c.Close(); exit 0 } catch { exit 1 }"
)
if not errorlevel 1 goto ready

timeout /t 1 /nobreak >nul
goto wait

:ready
start "" http://localhost:8000/index.html
echo [run] ready - http://localhost:8000/index.html is open in your browser.
echo [run] close the server window to stop the server.
goto end

:failed
echo [run] the server did not answer on port 8000 - check the server window.
pause

:end
