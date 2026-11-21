@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8765/api/status'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% equ 0 goto openpage
echo Starting HEXSTATS local service...
start "HEXSTATS Service" powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0serve.ps1" -NoBrowser
set /a tries=0
:wait
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8765/api/status'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% equ 0 goto openpage
set /a tries+=1
if %tries% lss 20 goto wait
echo.
echo Service did not start within 20 seconds.
echo Check the "HEXSTATS Service" window for the error message.
pause
exit /b 1
:openpage
start "" "http://127.0.0.1:8765/"
echo.
echo Page opened: http://127.0.0.1:8765/
echo Close the "HEXSTATS Service" window to stop the service.
ping -n 3 127.0.0.1 >nul