@echo off
title Expression Training APP - Full Local Trial
cd /d "%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
  echo Windows PowerShell was not found.
  pause
  exit /b 1
)
set "SERVER_ARGS="
if /i "%~1"=="--no-open" set "SERVER_ARGS=-NoOpen"
"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-full-stack.ps1" %SERVER_ARGS%
if errorlevel 1 (
  echo.
  echo Startup failed. Review the error and the logs folder.
  pause
)
