@echo off
title LlamaLaunch Server
setlocal enabledelayedexpansion

:: Set console colors (Green text on Black background) for a terminal-like feel
color 0a

echo ======================================================================
echo             LlamaLaunch Web Server Startup Script
echo ======================================================================
echo.

:: Change directory to the script's directory to ensure relative paths work
cd /d "%~dp0"

:: Case 1: If packaged standalone executable exists, run it directly (no Node.js required!)
if exist "LlamaLaunch_prod.exe" (
    set "LLAMA_EXE=LlamaLaunch_prod.exe"
) else if exist "LlamaLaunch.exe" (
    set "LLAMA_EXE=LlamaLaunch.exe"
)

if defined LLAMA_EXE (
    echo [INFO] Standalone executable !LLAMA_EXE! found!
    start /b cmd /c "timeout /t 2 >nul && start msedge --app=http://localhost:3000"
    
    echo [INFO] Starting LlamaLaunch server...
    echo Press Ctrl+C in this window to stop the server.
    echo.
    !LLAMA_EXE!
    
    if !errorlevel! neq 0 (
        echo.
        echo [INFO] Server stopped with exit code !errorlevel!.
        pause
    )
    exit /b 0
)

:: Case 2: Run in development / node mode
echo [INFO] Standalone executable not found. Running in Node.js mode...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js was not found on your system!
    echo Please install Node.js from https://nodejs.org/ before running this server.
    echo.
    pause
    exit /b 1
)

:: Check for root node_modules directory, install if missing
if not exist "node_modules\" (
    echo [INFO] Root node_modules folder not found. Installing dependencies...
    call npm install
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Failed to install root dependencies. Please run 'npm install' manually.
        pause
        exit /b 1
    )
)

:: Check for frontend node_modules directory, install if missing
if not exist "frontend\node_modules\" (
    echo [INFO] Frontend node_modules folder not found. Installing dependencies...
    call npm install --prefix frontend
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)

:: Check for compiled frontend, build if missing
if not exist "frontend\dist\" (
    echo [INFO] Compiled frontend assets not found. Building webapp...
    call npm run build
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Failed to compile frontend assets.
        pause
        exit /b 1
    )
)

:: Launch the web browser after a brief delay (gives the server time to start)
echo [INFO] Launching browser to http://localhost:3000 in the background...
start /b cmd /c "timeout /t 2 >nul && start msedge --app=http://localhost:3000"

:: Start the web server
echo [INFO] Starting LlamaLaunch web server...
echo Press Ctrl+C in this window to stop the server.
echo.
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Server stopped with exit code %errorlevel%.
    pause
)
