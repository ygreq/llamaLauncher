@echo off
cd /d "%~dp0"
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File tray_launcher.ps1
