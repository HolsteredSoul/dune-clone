@echo off
title Dune Clone
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js / npm was not found on your PATH.
  echo Install Node.js from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run - installing dependencies. This may take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed - see the messages above.
    pause
    exit /b 1
  )
)

echo.
echo ============================================
echo   Starting Dune Clone...
echo   Your browser will open automatically.
echo   Keep this window open while playing.
echo   Close it (or press Ctrl+C) to stop.
echo ============================================
echo.

call npm run dev -- --open

echo.
echo Server stopped.
pause
