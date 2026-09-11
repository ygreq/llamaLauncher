# LlamaLaunch Web Server Controller

This project is a local LLM server controller for `llama.cpp` built using Node.js and Express.

### Features
* **Model Server Dashboard:** Complete control panel to configure GGUF model files, context size, system threads, GPU layer offloading (VRAM splitting), temperature, and advanced custom parameters.
* **Direct Web Chat:** Talk to your loaded local LLM model directly inside the Web UI at `http://127.0.0.1:3000` with **real-time streaming responses**, custom system prompts, and styled code/markdown blocks.
* **System Tray Launcher:** Convenient background system tray controls with customized llama icon, letting you hide console windows while keeping the server running natively.
* **Hardware Optimizations:** Analyzes your VRAM and RAM to recommend optimal layer splits and cache sizing.

---

## How to Start the Web Server

### 1. Windowed Console Mode (Visible Logs)
Double-click [start.bat](file:///H:/AI/Antigravity/localLLM/start.bat) in the root directory. This will:
1. Ensure **Node.js** is installed.
2. Automatically run `npm install` if dependencies are missing.
3. Automatically launch your default browser to `http://localhost:3000` after a brief delay.
4. Run the web server in the console window so you can monitor logs.
5. Allow you to stop the server at any time by pressing `Ctrl + C` in the console window.

### 2. Background System Tray Mode (Hidden Console)
Double-click [start_tray.bat](file:///H:/AI/Antigravity/localLLM/start_tray.bat) in the root directory. This runs a background PowerShell script that:
1. Spawns the Node.js server invisibly with **no console window**.
2. Places a green icon (with an **L** for LlamaLaunch) in your Windows system tray.
3. Displays a balloon notification confirming the server started.
4. Provides a context menu when you right-click the tray icon with the following options:
   * **Open Web UI:** Opens the browser interface at `http://localhost:3000`. (Double-clicking the tray icon also performs this action).
   * **Restart Server:** Restarts the background process if it gets stuck.
   * **Exit:** Cleanly kills all Node.js and `llama-server.exe` processes and exits.

---

## Alternative Setup & Running Methods

### Create a Desktop Shortcut
To quickly start the server from your Desktop:
1. Right-click your Desktop and select **New** -> **Shortcut**.
2. Browse to and select [start.bat](file:///H:/AI/Antigravity/localLLM/start.bat).
3. Name the shortcut (e.g., `LlamaLaunch`).
4. *Optional:* Right-click the shortcut -> **Properties** -> **Change Icon...** to choose an icon. You can also set **Run** to **Minimized** if you want the console window to start out of view.

### Run Automatically on Windows Logon
You can make LlamaLaunch start automatically whenever you sign into Windows:
1. In the Web UI sidebar, toggle on **Start with Windows** under Quick Actions. This creates a shortcut in your Windows Startup folder that launches LlamaLaunch in tray mode.
2. Alternatively, manually create a shortcut: Press `Win + R`, type `shell:startup`, and press **Enter** (this opens your Windows Startup folder). Drag [start_tray.bat](file:///H:/AI/Antigravity/localLLM/start_tray.bat) into this folder.

### Run in the Background (via PM2)
If you prefer to run the server in the background without keeping a Command Prompt window open, you can use the PM2 process manager:
1. Install PM2 globally:
   ```cmd
   npm install -g pm2
   ```
2. Start the server:
   ```cmd
   pm2 start server.js --name "llamalaunch"
   ```
3. Check status / monitor logs:
   ```cmd
   pm2 status
   pm2 logs llamalaunch
   ```
4. Stop the server:
   ```cmd
   pm2 stop llamalaunch
   ```
