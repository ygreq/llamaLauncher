# LlamaLaunch — Workspace Rules & Instructions

Acest director conține codul sursă și fișierele de execuție pentru LlamaLaunch (server Node.js, controller system tray și client web streaming).

## Structură Workspace
- `server.js` / `server_bundled.js`: Server Express ce controlează instanțele `llama-server.exe`.
- `tray_launcher.ps1` / `start_tray.bat`: Script PowerShell de fundal pentru integrarea în system tray-ul Windows.
- `linkprocessor/`: Modulul de procesare și formatare a linkurilor web pentru Logseq.
- `frontend/`: Interfața utilizator construită cu Vite și Vanilla JS.

## Reguli de Documentare
- Toată documentația extinsă trăiește în Obsidian: [`_NexusKnowledgeBase_/Apps/llamaLauncher/`](file:///E:/Nexus/_NexusKnowledgeBase_/Apps/llamaLauncher/README.md).
- În workspace rămân exclusiv `README.md`, `AGENTS.md` și fișierele de cod / build.