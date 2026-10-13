@echo off
REM ---------------------------------------------------------------------------
REM  Single-file bundle builder.  Double-click to run.
REM
REM  NOTE: this file is deliberately **pure ASCII** - see the note in the dev
REM  server launcher for why.  Chinese output comes from node.
REM ---------------------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js was not found on PATH.
  echo.
  echo       This project needs Node 24 or newer.
  echo       Get it from https://nodejs.org/  ^(pick the LTS build^),
  echo       then close this window and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "hsr_build.mjs" (
  echo.
  echo   [X] hsr_build.mjs is missing.
  echo       Put this .bat in the calculator's own folder and try again.
  echo.
  pause
  exit /b 1
)

if not exist "_data_cache\hsr_core.json" (
  echo.
  echo   [!] _data_cache\hsr_core.json not found.
  echo       Building it first, this may take a moment...
  echo.
  node _scripts\build_data.mjs
  if errorlevel 1 (
    echo.
    echo   [X] Data build failed. See the messages above.
    echo.
    pause
    exit /b 1
  )
)

node hsr_build.mjs %*
if errorlevel 1 (
  echo.
  echo   [X] Bundle failed. The HTML file was NOT written.
  echo.
  pause
  exit /b 1
)

REM Do NOT echo the output file name here - it is Chinese, and this file must
REM stay pure ASCII.  hsr_build.mjs already printed the full path above.
echo.
echo Done. See the path printed by the bundler above.
echo Double-click that HTML file to use it - no server, no install, no build.
echo.
pause
