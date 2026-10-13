@echo off
REM ---------------------------------------------------------------------------
REM  Dev server launcher.  Double-click to run.
REM
REM  NOTE: this file is deliberately **pure ASCII**.  cmd.exe parses batch files
REM  in the OEM codepage, and a .bat containing UTF-8 Chinese will mangle any
REM  path or label it touches.  The FILE NAME is Chinese, the CONTENT is not.
REM  All Chinese output comes from node, which handles UTF-8 correctly once
REM  chcp 65001 is set below.
REM ---------------------------------------------------------------------------
chcp 65001 >nul

REM Run from this file's own folder even if launched as admin from elsewhere.
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

if not exist "hsr_server.mjs" (
  echo.
  echo   [X] hsr_server.mjs is missing.
  echo       Put this .bat in the calculator's own folder and try again.
  echo.
  pause
  exit /b 1
)

if not exist "_data_cache\data.inline.js" (
  echo.
  echo   [!] _data_cache\data.inline.js not found - the page will load without data.
  echo       Build it first by running:   node _scripts\build_data.mjs
  echo.
)

echo Starting dev server. Close this window (or press Ctrl+C) to stop.
echo.
node hsr_server.mjs %*

echo.
echo Server stopped.
pause
