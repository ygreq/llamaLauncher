const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Polyfill global File for Node 18 packaging target (required by undici)
if (typeof globalThis.File === 'undefined') {
  try {
    globalThis.File = require('node:buffer').File;
  } catch (e) {
    // fallback if node:buffer doesn't export File
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PORT = process.env.LLAMALAUNCH_PORT || 3000;

const isPackaged = process.pkg !== undefined;
const APP_DIR = isPackaged
  ? path.dirname(process.execPath)
  : __dirname;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(APP_DIR, 'config.json');
const DEFAULT_LLAMA_SERVER_EXE = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
const PUBLIC_DIR = path.join(APP_DIR, 'frontend', 'dist');
const LOG_BUFFER_SIZE = 2000;

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------
let serverState = {
  state: 'stopped',   // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  pid: null,
  model: null,
  port: null,
  startedAt: null,
  exitCode: null,
};

let childProcess = null;

/** Circular log buffer (last LOG_BUFFER_SIZE entries). */
const logBuffer = [];

/** Active SSE client response objects. */
const sseClients = [];

// ---------------------------------------------------------------------------
// Helpers — SSE
// ---------------------------------------------------------------------------

/**
 * Broadcast an SSE event to every connected client.
 * @param {string} event  SSE event name
 * @param {object} data   JSON-serialisable payload
 */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    if (client.writableEnded || client.destroyed) {
      sseClients.splice(i, 1);
      continue;
    }
    try {
      client.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

/**
 * Push a log line into the buffer and broadcast it to SSE clients.
 * @param {'stdout'|'stderr'|'system'} type
 * @param {string} text
 */
function pushLog(type, text) {
  const entry = { type, text, ts: new Date().toISOString() };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
  broadcast('log', entry);
}

/**
 * Update serverState fields and broadcast a status event.
 * @param {object} patch  Fields to merge into serverState
 */
function setState(patch) {
  Object.assign(serverState, patch);
  broadcast('status', {
    state: serverState.state,
    pid: serverState.pid,
    model: serverState.model,
    port: serverState.port,
  });
}

// ---------------------------------------------------------------------------
// Helpers — Config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = { scanDirs: [], lastUsed: '', profiles: {}, autoStart: false, llamaServerPath: '', startWithWindows: false };

/**
 * Resolve the llama-server executable path.
 * Priority: config file setting > LLAMA_SERVER_PATH env var > default.
 * @returns {string}
 */
function getLlamaServerExe() {
  const cfg = readConfig();
  return cfg.llamaServerPath || process.env.LLAMA_SERVER_PATH || DEFAULT_LLAMA_SERVER_EXE;
}

/**
 * Read config.json, returning defaults if missing or corrupt.
 * @returns {object}
 */
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const cfg = { ...DEFAULT_CONFIG };
    writeConfig(cfg);
    return cfg;
  }
}

/**
 * Write a config object to disk.
 * @param {object} cfg
 */
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Helpers — Windows Auto-Start
// ---------------------------------------------------------------------------

const STARTUP_FILE_NAME = 'LlamaLaunch Startup.bat';

/**
 * Get the Windows Startup folder path.
 * @returns {string|null}
 */
function getStartupFolder() {
  if (process.platform !== 'win32') return null;
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

/**
 * Check if LlamaLaunch is configured to start with Windows.
 * @returns {boolean}
 */
function isStartWithWindowsEnabled() {
  const startupDir = getStartupFolder();
  if (!startupDir) return false;
  return fs.existsSync(path.join(startupDir, STARTUP_FILE_NAME));
}

/**
 * Create or remove the Windows startup shortcut.
 * @param {boolean} enabled
 */
function setStartWithWindows(enabled) {
  const startupDir = getStartupFolder();
  if (!startupDir) return false;

  const startupFile = path.join(startupDir, STARTUP_FILE_NAME);

  if (enabled) {
    const batPath = path.join(APP_DIR, 'start_tray.bat');
    let targetCmd;
    if (fs.existsSync(batPath)) {
      targetCmd = `"${batPath}"`;
    } else {
      let exePath = path.join(APP_DIR, 'LlamaLaunch_prod.exe');
      if (!fs.existsSync(exePath)) {
        exePath = path.join(APP_DIR, 'LlamaLaunch.exe');
      }
      targetCmd = `"${exePath}"`;
    }
    const content = '@echo off\r\rcd /d "' + APP_DIR + '"\r\n' + targetCmd + '\r\n';
    fs.writeFileSync(startupFile, content, 'utf-8');
    return true;
  } else {
    try { fs.unlinkSync(startupFile); } catch { /* ignore if not exists */ }
    return true;
  }
}


/**
 * Construct the array of command-line arguments for llama-server from a profile.
 * @param {object} profile
 * @returns {Array<string>}
 */
function buildArgsForProfile(profile) {
  const args = [];
  if (!profile) return args;

  const model = profile.model;
  if (model) {
    args.push('-m', model);
  }

  // 1. Server
  const host = profile.host;
  if (host) args.push('--host', host);
  const port = profile.port;
  if (port) args.push('--port', String(port));
  const alias = profile.alias;
  if (alias) args.push('--alias', alias);
  const parallel = parseInt(profile.parallel, 10);
  if (!isNaN(parallel) && parallel !== -1) args.push('-np', parallel.toString());
  const apiKey = profile.apiKey;
  if (apiKey) args.push('--api-key', apiKey);
  const timeoutVal = profile.timeout;
  if (timeoutVal !== undefined && timeoutVal !== '' && timeoutVal !== 0) args.push('--timeout', String(timeoutVal));
  if (profile.metrics === true) args.push('--metrics');

  // 2. Model & Context
  const contextSize = parseInt(profile.contextSize, 10);
  if (!isNaN(contextSize) && contextSize > 0) args.push('-c', contextSize.toString());
  const nPredict = parseInt(profile.nPredict, 10);
  if (!isNaN(nPredict) && nPredict !== -1) args.push('-n', nPredict.toString());
  if (profile.noContextShift === true) args.push('--no-context-shift');
  const chatTemplate = profile.chatTemplate;
  if (chatTemplate) args.push('--chat-template', chatTemplate);
  const chatTemplateKwargs = profile.chatTemplateKwargs;
  if (chatTemplateKwargs) args.push('--chat-template-kwargs', chatTemplateKwargs);
  if (profile.jinja === true) args.push('--jinja');
  const mmproj = profile.mmproj;
  if (mmproj) args.push('--mmproj', mmproj);

  // 3. GPU & Memory
  const gpuLayers = profile.gpuLayers;
  if (gpuLayers && gpuLayers !== 'auto') args.push('-ngl', String(gpuLayers));
  const flashAttn = profile.flashAttn;
  if (flashAttn && flashAttn !== 'auto') args.push('-fa', flashAttn);
  const fit = profile.fit;
  if (fit && fit !== 'on') args.push('--fit', fit);
  const fitTarget = parseInt(profile.fitTarget, 10);
  if (!isNaN(fitTarget) && fitTarget !== 1024) args.push('--fit-target', fitTarget.toString());
  const splitMode = profile.splitMode;
  if (splitMode && splitMode !== 'layer') args.push('--split-mode', splitMode);
  const tensorSplit = profile.tensorSplit;
  if (tensorSplit) args.push('--tensor-split', tensorSplit);
  const mainGpu = parseInt(profile.mainGpu, 10);
  if (!isNaN(mainGpu) && mainGpu !== 0) args.push('--main-gpu', mainGpu.toString());
  const cacheTypeK = profile.cacheTypeK;
  if (cacheTypeK && cacheTypeK !== 'f16') args.push('-ctk', cacheTypeK);
  const cacheTypeV = profile.cacheTypeV;
  if (cacheTypeV && cacheTypeV !== 'f16') args.push('-ctv', cacheTypeV);
  if (profile.cpuMoe === true) args.push('--cpu-moe');
  if (profile.mlock === true) args.push('--mlock');
  const threads = parseInt(profile.threads, 10);
  if (!isNaN(threads) && threads !== -1) args.push('-t', threads.toString());
  const batchSize = parseInt(profile.batchSize, 10);
  if (!isNaN(batchSize) && batchSize !== 2048) args.push('-b', batchSize.toString());

  // 4. Sampling
  const temp = profile.temp;
  if (temp !== undefined && String(temp) !== '0.8' && String(temp) !== '0.80' && String(temp) !== '') args.push('--temp', String(temp));
  const topK = profile.topK;
  if (topK !== undefined && String(topK) !== '40' && String(topK) !== '') args.push('--top-k', String(topK));
  const topP = profile.topP;
  if (topP !== undefined && String(topP) !== '0.95' && String(topP) !== '') args.push('--top-p', String(topP));
  const minP = profile.minP;
  if (minP !== undefined && String(minP) !== '0.05' && String(minP) !== '') args.push('--min-p', String(minP));
  const repeatPenalty = profile.repeatPenalty;
  if (repeatPenalty !== undefined && String(repeatPenalty) !== '1' && String(repeatPenalty) !== '1.0' && String(repeatPenalty) !== '1.00' && String(repeatPenalty) !== '') args.push('--repeat-penalty', String(repeatPenalty));
  const presencePenalty = profile.presencePenalty;
  if (presencePenalty !== undefined && String(presencePenalty) !== '0' && String(presencePenalty) !== '0.0' && String(presencePenalty) !== '0.00' && String(presencePenalty) !== '') args.push('--presence-penalty', String(presencePenalty));
  const frequencyPenalty = profile.frequencyPenalty;
  if (frequencyPenalty !== undefined && String(frequencyPenalty) !== '0' && String(frequencyPenalty) !== '0.0' && String(frequencyPenalty) !== '0.00' && String(frequencyPenalty) !== '') args.push('--frequency-penalty', String(frequencyPenalty));
  const seed = profile.seed;
  if (seed !== undefined && String(seed) !== '-1' && String(seed) !== '') args.push('--seed', String(seed));
  const dryMultiplier = profile.dryMultiplier;
  if (dryMultiplier !== undefined && String(dryMultiplier) !== '0' && String(dryMultiplier) !== '0.0' && String(dryMultiplier) !== '0.00' && String(dryMultiplier) !== '') args.push('--dry-multiplier', String(dryMultiplier));
  const mirostat = profile.mirostat;
  if (mirostat !== undefined && String(mirostat) !== '0') args.push('--mirostat', String(mirostat));

  // 5. Advanced
  const lora = profile.lora;
  if (lora) args.push('--lora', lora);
  const ropeScaling = profile.ropeScaling;
  if (ropeScaling && ropeScaling !== 'none' && ropeScaling !== '') args.push('--rope-scaling', ropeScaling);
  const ropeScale = profile.ropeScale;
  if (ropeScale) args.push('--rope-scale', ropeScale);
  const rpcServers = profile.rpcServers;
  if (rpcServers) args.push('--rpc', rpcServers);
  if (profile.verbose === true) args.push('--verbose');
  const logFile = profile.logFile;
  if (logFile) args.push('--log-file', logFile);

  // Custom args
  const customArgsRaw = profile.customArgs;
  if (customArgsRaw) {
    const lines = customArgsRaw.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      const parts = line.split(' ');
      args.push(...parts);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Helpers — File scanning
// ---------------------------------------------------------------------------

/**
 * Human-readable file size.
 * @param {number} bytes
 * @returns {string}
 */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  for (const unit of units) {
    value /= 1024;
    if (value < 1024 || unit === 'TB') {
      return `${value.toFixed(1)} ${unit}`;
    }
  }
  return `${bytes} B`;
}

/**
 * Recursively scan a directory for *.gguf files up to `maxDepth` levels.
 * @param {string} dir
 * @param {number} depth   current depth (0 = root)
 * @param {number} maxDepth
 * @param {string} [rootDir]  root directory being scanned
 * @returns {Array<{name:string, path:string, size:number, sizeHuman:string, isMultimodal:boolean, folder:string, rootDir:string}>}
 */
function scanGguf(dir, depth, maxDepth, rootDir = dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && depth < maxDepth) {
      results.push(...scanGguf(fullPath, depth + 1, maxDepth, rootDir));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch { /* ignore */ }
      const relPath = path.relative(rootDir, fullPath);
      const subDir = path.dirname(relPath);
      const folder = path.dirname(fullPath);
      const shortFolder = subDir !== '.' ? subDir : path.basename(rootDir);
      const lowerName = entry.name.toLowerCase();
      const isMultimodal = lowerName.includes('mmproj') || lowerName.includes('vision-projector') || lowerName.includes('vision_projector');
      results.push({
        name: entry.name,
        path: fullPath,
        size,
        sizeHuman: humanSize(size),
        isMultimodal,
        folder,
        dir: folder,
        shortFolder,
        subDir: subDir !== '.' ? subDir : '',
        rootDir,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---- GET /api/status ------------------------------------------------------
app.get('/api/status', (_req, res) => {
  try {
    const uptime =
      serverState.startedAt && serverState.state !== 'stopped' && serverState.state !== 'error'
        ? Math.floor((Date.now() - new Date(serverState.startedAt).getTime()) / 1000)
        : null;

    res.json({
      state: serverState.state,
      pid: serverState.pid,
      model: serverState.model,
      port: serverState.port,
      startedAt: serverState.startedAt,
      uptime,
      exitCode: serverState.exitCode,
    });
  } catch (err) {
    console.error('[/api/status]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Starts the llama-server subprocess with the given arguments.
 * @param {Array<string>} args
 * @returns {number} PID of the spawned process
 */
function startLlamaServer(args) {
  if (childProcess && serverState.state !== 'stopped' && serverState.state !== 'error') {
    throw new Error('Server is already running');
  }

  const llamaServerExe = getLlamaServerExe();

  // Validate that the llama-server executable exists
  if (!fs.existsSync(llamaServerExe)) {
    const msg = `llama-server executable not found at: ${llamaServerExe}. Please set the correct path in the Server settings.`;
    console.error('[startLlamaServer]', msg);
    throw new Error(msg);
  }

  // Extract model name from -m argument
  let model = null;
  const mIdx = args.indexOf('-m');
  if (mIdx !== -1 && mIdx + 1 < args.length) {
    const modelPath = args[mIdx + 1];
    if (modelPath && !fs.existsSync(modelPath)) {
      throw new Error(`Model file not found on disk: "${modelPath}"`);
    }
    model = path.basename(modelPath);
  }

  // Extract port from --port argument
  let llamaPort = null;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && portIdx + 1 < args.length) {
    llamaPort = parseInt(args[portIdx + 1], 10) || null;
  }

  const child = spawn(llamaServerExe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess = child;

  setState({
    state: 'starting',
    pid: child.pid,
    model,
    port: llamaPort,
    startedAt: new Date().toISOString(),
    exitCode: null,
  });

  pushLog('system', `Starting llama-server (PID ${child.pid}) with args: ${args.join(' ')}`);

  // Helper: process incoming data line-by-line, handling \r\n and \n
  function handleStream(stream, type) {
    let remainder = '';
    stream.on('data', (chunk) => {
      const text = remainder + chunk.toString();
      const lines = text.split(/\r?\n/);
      remainder = lines.pop(); // last element may be partial
      for (const line of lines) {
        if (line.length === 0) continue;
        pushLog(type, line);
        // Detect when the server is ready
        if (serverState.state === 'starting' && /listening/i.test(line)) {
          setState({ state: 'running' });
          pushLog('system', 'llama-server is now listening.');
        }
      }
    });
    stream.on('end', () => {
      if (remainder.length > 0) {
        pushLog(type, remainder);
        remainder = '';
      }
    });
  }

  handleStream(child.stdout, 'stdout');
  handleStream(child.stderr, 'stderr');

  child.on('error', (err) => {
    console.error('[spawn error]', err);
    pushLog('system', `Spawn error: ${err.message}`);
    setState({ state: 'error', exitCode: -1 });
    childProcess = null;
  });

  child.on('close', (code) => {
    const exitCode = code ?? -1;
    pushLog('system', `llama-server exited with code ${exitCode}`);
    const wasIntentional = serverState.state === 'stopping';
    setState({
      state: (exitCode === 0 || wasIntentional) ? 'stopped' : 'error',
      pid: null,
      exitCode,
    });
    childProcess = null;
  });

  return child.pid;
}

// ---- POST /api/start ------------------------------------------------------
app.post('/api/start', (req, res) => {
  try {
    if (childProcess && serverState.state !== 'stopped' && serverState.state !== 'error') {
      return res.status(409).json({ error: 'Server is already running' });
    }

    const args = req.body.args || [];
    const pid = startLlamaServer(args);
    res.json({ success: true, pid });
  } catch (err) {
    console.error('[/api/start]', err);
    res.status(500).json({ error: err.message || 'Failed to start server' });
  }
});

// ---- POST /api/stop -------------------------------------------------------
app.post('/api/stop', (_req, res) => {
  try {
    if (!childProcess) {
      pushLog('system', 'No active llama-server process tracked. Attempting to kill any dangling llama-server processes...');
      if (process.platform === 'win32') {
        exec('taskkill /IM llama-server.exe /T /F', (err) => {
          if (err) {
            console.error('[taskkill clean]', err);
          }
        });
      } else {
        exec('pkill -f llama-server', (err) => {
          if (err) {
            console.error('[pkill clean]', err);
          }
        });
      }
      setState({ state: 'stopped', pid: null });
      return res.json({ success: true });
    }

    const pid = childProcess.pid;
    pushLog('system', `Stopping llama-server (PID ${pid})...`);
    setState({ state: 'stopping' });

    if (process.platform === 'win32') {
      // On Windows, use taskkill to kill the entire process tree
      exec(`taskkill /pid ${pid} /T /F`, (err) => {
        if (err) {
          console.error('[taskkill]', err);
          // Fallback: try the Node kill
          try { childProcess.kill('SIGKILL'); } catch { /* ignore */ }
        }
      });
    } else {
      // On Linux/macOS, stop child process and clean up
      try {
        childProcess.kill('SIGTERM');
      } catch (err) {
        console.error('[kill SIGTERM]', err);
        try { childProcess.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/stop]', err);
    res.status(500).json({ error: 'Failed to stop server' });
  }
});

// ---- GET /api/logs (SSE) --------------------------------------------------
app.get('/api/logs', (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send current status
    res.write(`event: status\ndata: ${JSON.stringify({
      state: serverState.state,
      pid: serverState.pid,
      model: serverState.model,
      port: serverState.port,
    })}\n\n`);

    // Replay buffered log lines
    for (const entry of logBuffer) {
      res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
    }

    // Register client
    sseClients.push(res);

    // Remove on disconnect
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  } catch (err) {
    console.error('[/api/logs]', err);
    res.status(500).end();
  }
});

// ---- GET /api/models ------------------------------------------------------
app.get('/api/models', (_req, res) => {
  try {
    const config = readConfig();
    let dirs = config.scanDirs || [];

    // In Docker/Linux containers, ensure the mapped /models directory is included
    if (process.platform !== 'win32') {
      if (!dirs.includes('/models') && fs.existsSync('/models')) {
        dirs = ['/models', ...dirs.filter(d => d !== '/models')];
      }
    }

    let models = [];
    for (const dir of dirs) {
      models.push(...scanGguf(dir, 0, 6, dir));
    }

    // Sort: non-multimodal first, then alphabetically by name
    models.sort((a, b) => {
      if (a.isMultimodal !== b.isMultimodal) return a.isMultimodal ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    res.json(models);
  } catch (err) {
    console.error('[/api/models]', err);
    res.status(500).json({ error: 'Failed to scan models' });
  }
});

// ---- GET /api/config ------------------------------------------------------
app.get('/api/config', (_req, res) => {
  try {
    res.json(readConfig());
  } catch (err) {
    console.error('[/api/config]', err);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// ---- POST /api/config -----------------------------------------------------
app.post('/api/config', (req, res) => {
  try {
    const existing = readConfig();
    const { profiles, scanDirs, lastUsed, hardware, autoStart, llamaServerPath, startWithWindows } = req.body;

    if (profiles !== undefined) existing.profiles = profiles;
    if (scanDirs !== undefined) existing.scanDirs = scanDirs;
    if (lastUsed !== undefined) existing.lastUsed = lastUsed;
    if (hardware !== undefined) existing.hardware = hardware;
    if (autoStart !== undefined) existing.autoStart = autoStart;
    if (llamaServerPath !== undefined) existing.llamaServerPath = llamaServerPath;

    writeConfig(existing);

    // Handle Windows auto-start
    if (startWithWindows !== undefined) {
      existing.startWithWindows = startWithWindows;
      if (process.platform === 'win32') {
        setStartWithWindows(startWithWindows);
      }
      writeConfig(existing);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/config]', err);
    res.status(500).json({ error: 'Failed to write config' });
  }
});

let activeFolderBrowseProcess = null;
let activeFileBrowseProcess = null;

// ---- POST /api/browse-folder ----------------------------------------------
app.post('/api/browse-folder', (req, res) => {
  try {
    if (process.platform !== 'win32') {
      return res.status(400).json({ error: 'Folder browsing is only supported on Windows. Please enter the directory path manually.' });
    }

    if (activeFolderBrowseProcess) {
      try { activeFolderBrowseProcess.kill(); } catch { /* ignore */ }
      activeFolderBrowseProcess = null;
    }

    const body = req.body || {};
    const description = (body.description || 'Select a folder').replace(/'/g, "''");
    const initialDir = (body.initialDir || '').replace(/'/g, "''");
    const initialDirScript = initialDir && fs.existsSync(initialDir)
      ? `$dialog.SelectedPath = '${initialDir}'`
      : '';
    const tempPs1 = path.join(os.tmpdir(), `llamalaunch_browse_${Date.now()}.ps1`);
    fs.writeFileSync(tempPs1, `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "LlamaLaunch - ${description}"
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(0, 0)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.Show()
$form.BringToFront()
$form.Activate()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${description}'
$dialog.ShowNewFolderButton = $true
${initialDirScript}

try {
    $wshell = New-Object -ComObject Wscript.Shell
    $wshell.AppActivate($form.Text)
} catch {}

$res = $dialog.ShowDialog($form)
$form.Close()
$form.Dispose()

if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
`, 'utf-8');

    activeFolderBrowseProcess = exec(`powershell -NoProfile -ExecutionPolicy Bypass -STA -File "${tempPs1}"`, { timeout: 120000 }, (err, stdout, stderr) => {
      activeFolderBrowseProcess = null;
      try { fs.unlinkSync(tempPs1); } catch { /* ignore */ }
      if (err) {
        if (err.killed) return res.json({ path: null, cancelled: true });
        console.error('[Folder Browser Error]', err, stderr);
        return res.status(500).json({ error: 'Failed to open folder browser dialog.' });
      }
      const selectedPath = stdout.trim();
      res.json({ path: selectedPath || null });
    });
  } catch (err) {
    console.error('[/api/browse-folder]', err);
    res.status(500).json({ error: 'Failed to open folder browser.' });
  }
});

// ---- POST /api/open-folder ------------------------------------------------
app.post('/api/open-folder', (req, res) => {
  try {
    const { folderPath } = req.body || {};
    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder path does not exist on disk' });
    }
    const safePath = folderPath.replace(/"/g, '');
    if (process.platform === 'win32') {
      exec(`explorer.exe "${safePath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${safePath}"`);
    } else {
      exec(`xdg-open "${safePath}"`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[/api/open-folder]', err);
    res.status(500).json({ error: 'Failed to open folder' });
  }
});

// ---- POST /api/browse-file --------------------------------------------------
app.post('/api/browse-file', (req, res) => {
  try {
    if (process.platform !== 'win32') {
      return res.status(400).json({ error: 'File browsing is only supported on Windows. Please enter the path manually.' });
    }

    if (activeFileBrowseProcess) {
      try { activeFileBrowseProcess.kill(); } catch { /* ignore */ }
      activeFileBrowseProcess = null;
    }

    const body = req.body || {};
    const filter = (body.filter || 'llama-server executable (llama-server.exe)|llama-server.exe|All files (*.*)|*.*').replace(/'/g, "''");
    const title = (body.title || 'Select a file').replace(/'/g, "''");
    const initialDir = (body.initialDir || '').replace(/'/g, "''");
    const tempPs1 = path.join(os.tmpdir(), `llamalaunch_browse_file_${Date.now()}.ps1`);
    fs.writeFileSync(tempPs1, `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "LlamaLaunch - ${title}"
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(0, 0)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.Show()
$form.BringToFront()
$form.Activate()

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = '${filter}'
$dialog.Title = '${title}'
if ('${initialDir}' -and (Test-Path '${initialDir}')) {
    $dialog.InitialDirectory = '${initialDir}'
} else {
    $dialog.InitialDirectory = [Environment]::GetFolderPath("UserProfile")
}
$dialog.AutoUpgradeEnabled = $true

try {
    $wshell = New-Object -ComObject Wscript.Shell
    $wshell.AppActivate($form.Text)
} catch {}

$res = $dialog.ShowDialog($form)
$form.Close()
$form.Dispose()

if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.FileName
}
`, 'utf-8');

    activeFileBrowseProcess = exec(`powershell -NoProfile -ExecutionPolicy Bypass -STA -File "${tempPs1}"`, { timeout: 120000 }, (err, stdout, stderr) => {
      activeFileBrowseProcess = null;
      try { fs.unlinkSync(tempPs1); } catch { /* ignore */ }
      if (err) {
        if (err.killed) return res.json({ path: null, cancelled: true });
        console.error('[File Browser Error]', err, stderr);
        return res.status(500).json({ error: 'Failed to open file browser dialog.' });
      }
      const selectedPath = stdout.trim();
      res.json({ path: selectedPath || null });
    });
  } catch (err) {
    console.error('[/api/browse-file]', err);
    res.status(500).json({ error: 'Failed to open file browser.' });
  }
});

// ---- GET /api/llama-server-path ---------------------------------------------
app.get('/api/llama-server-path', (_req, res) => {
  try {
    const cfg = readConfig();
    res.json({
      path: getLlamaServerExe(),
      configured: !!cfg.llamaServerPath,
      exists: fs.existsSync(getLlamaServerExe()),
    });
  } catch (err) {
    console.error('[/api/llama-server-path]', err);
    res.status(500).json({ error: 'Failed to read llama-server path' });
  }
});

// ---- GET /api/auto-start -----------------------------------------------------
app.get('/api/auto-start', (_req, res) => {
  try {
    res.json({ enabled: isStartWithWindowsEnabled() });
  } catch (err) {
    console.error('[/api/auto-start]', err);
    res.status(500).json({ error: 'Failed to read auto-start state' });
  }
});

// ---- POST /api/auto-start ----------------------------------------------------
app.post('/api/auto-start', (req, res) => {
  try {
    const { enabled } = req.body;
    setStartWithWindows(!!enabled);
    const existing = readConfig();
    existing.startWithWindows = !!enabled;
    writeConfig(existing);
    res.json({ success: true, enabled: isStartWithWindowsEnabled() });
  } catch (err) {
    console.error('[/api/auto-start]', err);
    res.status(500).json({ error: 'Failed to update auto-start' });
  }
});

// ---- POST /api/chat (Proxy to llama-server) ------------------------------
app.post('/api/chat', (req, res) => {
  try {
    if (serverState.state !== 'running' || !serverState.port) {
      return res.status(503).json({ error: 'Local model server is not running.' });
    }

    const http = require('http');
    const postData = JSON.stringify(req.body);

    const options = {
      hostname: '127.0.0.1',
      port: serverState.port,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Chat Proxy Error]', err);
      res.status(500).json({ error: 'Failed to connect to llama-server' });
    });

    proxyReq.write(postData);
    proxyReq.end();
  } catch (err) {
    console.error('[/api/chat error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- GET /api/link-processor/status ---------------------------------------
app.get('/api/link-processor/status', async (_req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    const watcherStatus = linkProcessor.getWatcherStatus();
    const llmActive = await require('./linkprocessor/llm').isLlmAvailable();
    const gitSummary = await require('./linkprocessor/git').getStatus().catch(() => ({
      enabled: !!(linkProcessor.config.git?.enabled),
      repoPath: linkProcessor.config.git?.repoPath || null,
      error: 'Unable to read Git status'
    }));

    res.json({
      watcherActive: watcherStatus.watcherActive,
      isProcessing: watcherStatus.isProcessing,
      isPaused: watcherStatus.isPaused,
      llmOnline: llmActive,
      inputFile: linkProcessor.config.inputFile,
      journalsDir: linkProcessor.config.journalsDir,
      git: gitSummary
    });
  } catch (err) {
    console.error('[/api/link-processor/status]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/link-processor/queue ----------------------------------------
app.get('/api/link-processor/queue', (_req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    const queue = linkProcessor.getQueueLinks();
    res.json({ success: true, queue });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- POST /api/link-processor/process --------------------------------------
app.post('/api/link-processor/process', async (req, res) => {
  try {
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : null;
    const linkProcessor = require('./linkprocessor');
    
    if (linkProcessor.getWatcherStatus().isProcessing) {
      return res.status(400).json({ success: false, error: 'Already processing' });
    }

    // Trigger processing in the background
    linkProcessor.processLinksFile(limit)
      .then(() => {
        pushLog('system', `✨ Manual processing completed (limit: ${limit || 'all'}).`);
      })
      .catch(err => {
        pushLog('system', `✗ Manual processing failed: ${err.message}`);
      });

    res.json({ success: true, message: 'Processing started' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/link-processor/config ---------------------------------------
app.get('/api/link-processor/config', (_req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    res.json({
      inputFile: linkProcessor.config.inputFile,
      journalsDir: linkProcessor.config.journalsDir,
      debounceMs: linkProcessor.config.debounceMs,
      categories: linkProcessor.config.categories,
      git: linkProcessor.config.git
    });
  } catch (err) {
    console.error('[/api/link-processor/config]', err);
    res.status(500).json({ error: 'Failed to read link processor config' });
  }
});

// ---- POST /api/link-processor/config --------------------------------------
app.post('/api/link-processor/config', (req, res) => {
  try {
    const { inputFile, journalsDir, debounceMs, categories } = req.body;
    const linkProcessor = require('./linkprocessor');

    // Update active runtime config
    linkProcessor.updateConfig({ inputFile, journalsDir, debounceMs });

    // Save to persistent config.json, preserving existing settings (e.g. git, categories)
    const existing = readConfig();
    existing.linkProcessor = existing.linkProcessor || {};
    if (inputFile !== undefined) existing.linkProcessor.inputFile = inputFile;
    if (journalsDir !== undefined) existing.linkProcessor.journalsDir = journalsDir;
    if (debounceMs !== undefined) existing.linkProcessor.debounceMs = parseInt(debounceMs, 10) || 2000;
    writeConfig(existing);

    // Persist category tags separately if provided
    if (categories && typeof categories === 'object') {
      const { saveCategories } = require('./linkprocessor/config');
      saveCategories(categories);
      linkProcessor.updateConfig({ categories });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/link-processor/config]', err);
    res.status(500).json({ error: 'Failed to save link processor config' });
  }
});

// ---- POST /api/link-processor/categories ------------------------------------
app.post('/api/link-processor/categories', (req, res) => {
  try {
    const { categories } = req.body || {};
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      return res.status(400).json({ error: 'A categories object is required' });
    }
    const linkProcessor = require('./linkprocessor');
    const { saveCategories, updateRuntimeConfig } = require('./linkprocessor/config');

    const savedPath = saveCategories(categories);
    updateRuntimeConfig({ categories });

    res.json({ success: true, path: savedPath, categories: linkProcessor.config.categories });
  } catch (err) {
    console.error('[/api/link-processor/categories]', err);
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

// ---- GET /api/link-processor/history ---------------------------------------
app.get('/api/link-processor/history', (_req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    const historyLog = linkProcessor.getHistoryLog(100);
    res.json({ success: true, history: historyLog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/link-processor/git/status ---------------------------------------------
app.get('/api/link-processor/git/status', async (_req, res) => {
  try {
    const git = require('./linkprocessor/git');
    const status = await git.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- POST /api/link-processor/git/sync -----------------------------------------------
app.post('/api/link-processor/git/sync', async (_req, res) => {
  try {
    const git = require('./linkprocessor/git');
    const result = await git.sync();
    res.json({ success: result.success, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/link-processor/git/config ---------------------------------------------
app.get('/api/link-processor/git/config', (_req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    res.json({
      enabled: linkProcessor.config.git?.enabled ?? false,
      repoPath: linkProcessor.config.git?.repoPath || null,
      autoPull: linkProcessor.config.git?.autoPull ?? true,
      autoCommit: linkProcessor.config.git?.autoCommit ?? true,
      autoPush: linkProcessor.config.git?.autoPush ?? true,
      pullIntervalMinutes: linkProcessor.config.git?.pullIntervalMinutes ?? 5,
      pushDebounceMs: linkProcessor.config.git?.pushDebounceMs ?? 30000,
      remoteName: linkProcessor.config.git?.remoteName || 'origin',
      branch: linkProcessor.config.git?.branch || null,
      name: linkProcessor.config.git?.name || 'Link Processor',
      email: linkProcessor.config.git?.email || 'link-processor@local',
      commitMessageTemplate: linkProcessor.config.git?.commitMessageTemplate || 'Auto-sync: {count} file(s) changed on {date}'
    });
  } catch (err) {
    console.error('[/api/link-processor/git/config]', err);
    res.status(500).json({ error: 'Failed to read Git config' });
  }
});

// ---- POST /api/link-processor/git/config --------------------------------------------
app.post('/api/link-processor/git/config', (req, res) => {
  try {
    const linkProcessor = require('./linkprocessor');
    const {
      enabled, repoPath, autoPull, autoCommit, autoPush,
      pullIntervalMinutes, pushDebounceMs, remoteName, branch,
      name, email, commitMessageTemplate
    } = req.body;

    const newGitConfig = {
      ...linkProcessor.config.git,
    };

    if (enabled !== undefined) newGitConfig.enabled = !!enabled;
    if (repoPath !== undefined) newGitConfig.repoPath = (typeof repoPath === 'string' && repoPath.trim()) ? repoPath.trim() : null;
    if (autoPull !== undefined) newGitConfig.autoPull = !!autoPull;
    if (autoCommit !== undefined) newGitConfig.autoCommit = !!autoCommit;
    if (autoPush !== undefined) newGitConfig.autoPush = !!autoPush;
    if (pullIntervalMinutes !== undefined) newGitConfig.pullIntervalMinutes = parseInt(pullIntervalMinutes, 10) || 0;
    if (pushDebounceMs !== undefined) newGitConfig.pushDebounceMs = parseInt(pushDebounceMs, 10) || 30000;
    if (remoteName !== undefined) newGitConfig.remoteName = remoteName;
    if (branch !== undefined) newGitConfig.branch = branch || null;
    if (name !== undefined) newGitConfig.name = name;
    if (email !== undefined) newGitConfig.email = email;
    if (commitMessageTemplate !== undefined) newGitConfig.commitMessageTemplate = commitMessageTemplate;

    linkProcessor.updateConfig({ git: newGitConfig });

    const existing = readConfig();
    existing.linkProcessor = existing.linkProcessor || {};
    existing.linkProcessor.git = newGitConfig;
    writeConfig(existing);

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/link-processor/git/config]', err);
    res.status(500).json({ error: 'Failed to save Git config' });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`LlamaLaunch running at http://localhost:${PORT}`);

  // Initialize Link Processor
  try {
    const linkProcessor = require('./linkprocessor');
    const existingConfig = readConfig();
    linkProcessor.init({
      getLlmPort: () => (serverState.state === 'running' ? serverState.port : null),
      pushLog: (type, text) => pushLog(type, text),
      initialConfig: existingConfig
    });
  } catch (err) {
    console.error('Failed to initialize Link Processor:', err);
  }

  // Sync Windows auto-start state with config
  try {
    const existingConfig = readConfig();
    if (process.platform === 'win32') {
      const actuallyEnabled = isStartWithWindowsEnabled();
      if (existingConfig.startWithWindows !== actuallyEnabled) {
        setStartWithWindows(existingConfig.startWithWindows);
      }
    }
  } catch (err) {
    console.error('Failed to sync Windows auto-start:', err);
  }

  // Auto-start Llama Server if configured
  try {
    const existingConfig = readConfig();
    if (existingConfig.autoStart && existingConfig.lastUsed && existingConfig.profiles[existingConfig.lastUsed]) {
      const profile = existingConfig.profiles[existingConfig.lastUsed];
      if (profile.model && !fs.existsSync(profile.model)) {
        console.warn(`[AutoStart] Skipping autostart: Model file not found on disk: "${profile.model}"`);
      } else {
        console.log(`[AutoStart] Automatically starting last used model profile: ${existingConfig.lastUsed}`);
        const args = buildArgsForProfile(profile);
        startLlamaServer(args);
      }
    }
  } catch (err) {
    console.error('Failed to auto-start llama-server:', err);
  }
});
