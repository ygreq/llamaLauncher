# 🚀 LlamaLauncher — Local LLM Server Controller

[![GitHub release](https://img.shields.io/github/v/release/ygreq/llamaLauncher?include_prereleases&style=flat-square&color=0ea5e9)](https://github.com/ygreq/llamaLauncher/releases)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io%2Fygreq%2Fllamalaunch-blue?logo=docker&style=flat-square)](https://github.com/ygreq/llamaLauncher/pkgs/container/llamalaunch)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![llama.cpp](https://img.shields.io/badge/Backend-llama.cpp-orange?style=flat-square)](https://github.com/ggerganov/llama.cpp)

A modern, high-performance web dashboard and process controller for **llama.cpp** servers. LlamaLaunch makes running, tuning, and interacting with local GGUF Large Language Models effortless, secure, and private.

---

## 📖 About LlamaLaunch

**LlamaLaunch** bridges the raw speed and low resource footprint of `llama.cpp` with an elegant, responsive web management console. Whether running on a Windows workstation, a dedicated AI rig, or a headless home server / NAS (OpenMediaVault, Unraid, TrueNAS), LlamaLaunch provides complete control over model execution, hardware allocation, multimodal projectors, and knowledge base automations.

### ✨ Key Features

* 🎛️ **Granular Server Control**: Effortlessly start, stop, and monitor `llama-server` instances with real-time SSE console streaming, live process PID tracking, and exit status monitoring.
* 📁 **Intelligent Model Library**:
  * Multi-directory recursive scanning (up to 6 levels deep).
  * Bulk folder importer with live path parsing and folder browsing.
  * Instant model sorting (by file size, alphabetical, or filesystem location) and keyboard shortcuts.
* 👁️ **Multimodal / Vision Support**: Automatic pairing and manual attachment of `mmproj` vision projectors for vision-language models (e.g. *Qwen2.5-VL*, *Llama 3.2 Vision*, *MiniCPM-V*).
* ⚡ **Hardware Optimizer & VRAM Calculator**:
  * Dynamic VRAM & RAM profiling.
  * Automatic calculation of optimal GPU offloading layers (`-ngl`), context sizes (`-c`), and KV cache quantizations (`q8_0`, `f16`).
* 💬 **Embedded Streaming Chat**: Direct conversational UI mirroring the `llama-server` web interface inside the dashboard, with zero third-party telemetry or cloud dependencies.
* 🔗 **Logseq & Obsidian Link Processor**:
  * Automated background pipeline monitoring `Links.md`.
  * Scrapes web articles, generates AI summaries and structured category tags via local LLM.
  * Formats and appends blocks directly into daily journal markdown files.
  * Built-in Git synchronization (pull, auto-commit, debounced push) to keep vaults synced.
* 🪟 **Native Windows System Tray Integration**: Lightweight background tray launcher (`tray_launcher.ps1`) with status notifications, quick browser access, and Windows Startup automation.
* 🐳 **Production-Ready Docker Container**: Automated GitHub Container Registry builds (`ghcr.io/ygreq/llamalaunch:latest`) with pre-packaged `llama-server` binaries, environment variable overrides, and persistent volume mappings.

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Browser / Client UI                      │
│        (Vite + Vanilla JS + Responsive Dark Theme)          │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP REST                     │ Server-Sent Events
               ▼                               │ (Logs & Status)
┌─────────────────────────────────────────────────────────────┐
│                  LlamaLaunch Express Core                   │
│             (Configuration, Profiles, API, SSE)             │
├──────────────────────────────┬──────────────────────────────┤
│    Model & Server Runner     │     Link Processor Engine    │
│  - Arguments Builder         │  - File Watcher (Links.md)   │
│  - Subprocess Lifecycle      │  - Metadata Scraper          │
│  - Hardware Calculations     │  - LLM Summarizer & Tagger   │
│  - Model Directory Scanner   │  - Vault Git Synchronizer    │
└──────────────┬───────────────┴───────────────┬──────────────┘
               │                               │
               ▼ Process Spawn                 ▼ Git CLI
┌──────────────────────────────┐ ┌────────────────────────────┐
│       llama-server.exe       │ │       Obsidian Vault       │
│  (GPU Acceleration / CUDA)   │ │  (Daily Journal Markdown)  │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Windows Console Mode (Visible Logs)
Double-click `start.bat` in the project root:
- Checks for Node.js and installs dependencies automatically if needed.
- Builds frontend assets and launches the server.
- Opens your browser to `http://localhost:3000`.

### 2. Windows Background System Tray Mode
Double-click `start_tray.bat` in the project root:
- Starts the server silently in the background with no command prompt window.
- Adds an **L** tray icon with options to open the Web UI, restart, or safely exit.

### 3. Docker & Headless Deployment (Docker Compose)
Copy `.env.example` to `.env` and run:

```bash
docker compose up -d
```

Access the web interface at `http://<your-server-ip>:3000`.

---

## ⚙️ Configuration & Profiles

* **Profiles**: Save fine-tuned parameter configurations (context window, temperature, Mirostat, presence penalty, LoRA adapters) under custom profile names.
* **Auto-Start**: Toggle **Auto-start server** to automatically boot your last used model whenever LlamaLaunch starts.
* **Documentation**: Extensive development guides, agent rules, and Obsidian vault setup reside in the project documentation:
  * [`AGENTS.md`](./AGENTS.md)
  * [`linkprocessor/AGENTS.md`](./linkprocessor/AGENTS.md)

---

## ☕ Support

If this project is helpful to you and you'd like to buy me a coffee:

<a href="https://www.buymeacoffee.com/ygreq">
  <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
</a>

Direct link: [buymeacoffee.com/ygreq](https://www.buymeacoffee.com/ygreq)

---

## 📄 License
MIT License. Free and open source for local AI enthusiasts.
