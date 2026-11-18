@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Ask Codex to install Node.js 22.12+ and start this project.
  pause
  exit /b 1
)
node scripts\start.mjs
set "START_CODE=%errorlevel%"
if not "%START_CODE%"=="0" pause
exit /b %START_CODE%
