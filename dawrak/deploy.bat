@echo off
setlocal
cd /d "%~dp0"
title Dawrak - Deploy

if not exist ".firebaserc" (
  echo ERROR: .firebaserc not found in this folder.
  pause
  exit /b 1
)

set PROJECT=
for /f "tokens=2 delims=:" %%a in ('findstr /c:"\"default\"" .firebaserc') do set PROJECT=%%a
set PROJECT=%PROJECT: =%
set PROJECT=%PROJECT:"=%
set PROJECT=%PROJECT:,=%

if "%PROJECT%"=="" (
  echo ERROR: could not read the project name from .firebaserc
  pause
  exit /b 1
)

echo.
echo  Folder  : %CD%
echo  Project : %PROJECT%
echo.
choice /c YN /m "Deploy to this Firebase project"
if errorlevel 2 (
  echo Cancelled.
  pause
  exit /b 0
)

call firebase deploy --project %PROJECT%
echo.
if errorlevel 1 (
  echo DEPLOY FAILED - read the error above.
) else (
  echo DONE - deployed to %PROJECT%.
)
pause
