@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Refreshing ARAM and Arena data, please wait...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0refresh.ps1" -ArenaTop 30
echo.
echo Refresh finished. Press any key to close.
pause >nul