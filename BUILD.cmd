@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0builder\Build.ps1" %*
if errorlevel 1 (
 echo BUILD FAILED. Read the error above.
 pause
 exit /b 1
)
echo Installer is in the dist folder.
pause
