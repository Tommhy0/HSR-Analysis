@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
python -X utf8 "_scripts\update_database.py" %*
if errorlevel 1 exit /b 1
node _scripts\build_data.mjs
if errorlevel 1 exit /b 1
node hsr_build.mjs
exit /b %errorlevel%
