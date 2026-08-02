@echo off
title Expression Training APP - Trial 1
cd /d "%~dp0"

set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
  echo Windows PowerShell was not found. The local app cannot start.
  pause
  exit /b 1
)

set "SERVER_ARGS="
if /i "%~1"=="--no-open" set "SERVER_ARGS=-NoOpen"
"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-server.ps1" %SERVER_ARGS%
if errorlevel 1 (
  echo.
  echo Startup failed. Review the error message above.
  pause
)
