/**
 * LlamaLaunch Frontend Logic
 */
import './style.css';

// Register Service Worker for PWA Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

// Global State
let config = { scanDirs: [], lastUsed: '', profiles: {} };
let models = [];
let lpCategories = {};
let currentArgsArray = [];
let isAutoScroll = true;

// DOM Elements
const DOM = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  
  modelSortBy: document.getElementById('modelSortBy'),
  btnPrevModel: document.getElementById('btnPrevModel'),
  btnNextModel: document.getElementById('btnNextModel'),
  modelSearchInput: document.getElementById('modelSearchInput'),
  btnClearModelSearch: document.getElementById('btnClearModelSearch'),
  
  modelSelectWrapper: document.getElementById('modelSelectWrapper'),
  modelPathWrapper: document.getElementById('modelPathWrapper'),
  modelSelect: document.getElementById('modelSelect'),
  modelPath: document.getElementById('modelPath'),
  toggleModelInput: document.getElementById('toggleModelInput'),
  btnBrowseModelFile: document.getElementById('btnBrowseModelFile'),
  btnBrowseModelFileManual: document.getElementById('btnBrowseModelFileManual'),
  btnBrowseModelDirLink: document.getElementById('btnBrowseModelDirLink'),
  btnRefreshModels: document.getElementById('btnRefreshModels'),

  sidebarMmprojSelect: document.getElementById('sidebarMmprojSelect'),
  sidebarMmprojPath: document.getElementById('sidebarMmprojPath'),
  sidebarMmprojSelectWrapper: document.getElementById('sidebarMmprojSelectWrapper'),
  sidebarMmprojPathWrapper: document.getElementById('sidebarMmprojPathWrapper'),
  toggleMmprojInput: document.getElementById('toggleMmprojInput'),
  sidebarMmprojBadge: document.getElementById('sidebarMmprojBadge'),
  btnBrowseMmproj: document.getElementById('btnBrowseMmproj'),
  btnClearMmproj: document.getElementById('btnClearMmproj'),
  btnBrowseMmprojManual: document.getElementById('btnBrowseMmprojManual'),
  btnClearMmprojManual: document.getElementById('btnClearMmprojManual'),
  btnBrowseMmprojTab: document.getElementById('btnBrowseMmprojTab'),
  btnClearMmprojTab: document.getElementById('btnClearMmprojTab'),
  
  profileSelect: document.getElementById('profileSelect'),
  btnSaveProfile: document.getElementById('btnSaveProfile'),
  btnSaveAsProfile: document.getElementById('btnSaveAsProfile'),
  btnDeleteProfile: document.getElementById('btnDeleteProfile'),
  
  scanDirsList: document.getElementById('scanDirsList'),
  scanDirInput: document.getElementById('scanDirInput'),
  btnBrowseScanDir: document.getElementById('btnBrowseScanDir'),
  btnAddScanDir: document.getElementById('btnAddScanDir'),
  btnOpenBulkScanDirs: document.getElementById('btnOpenBulkScanDirs'),
  bulkScanDirsModal: document.getElementById('bulkScanDirsModal'),
  btnCloseBulkScanDirs: document.getElementById('btnCloseBulkScanDirs'),
  btnCancelBulkScanDirs: document.getElementById('btnCancelBulkScanDirs'),
  bulkScanDirsInput: document.getElementById('bulkScanDirsInput'),
  bulkScanDirsCount: document.getElementById('bulkScanDirsCount'),
  btnBrowseAddToBulk: document.getElementById('btnBrowseAddToBulk'),
  btnClearAllScanDirs: document.getElementById('btnClearAllScanDirs'),
  btnAddAllBulkScanDirs: document.getElementById('btnAddAllBulkScanDirs'),
  
   btnStart: document.getElementById('btnStart'),
   btnStop: document.getElementById('btnStop'),
   btnOpenUI: document.getElementById('btnOpenUI'),
   llamaServerPath: document.getElementById('llamaServerPath'),
   btnBrowseLlamaServer: document.getElementById('btnBrowseLlamaServer'),
   startWithWindows: document.getElementById('startWithWindows'),
  
  tabButtons: document.querySelectorAll('.tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  
  commandPreview: document.getElementById('commandPreview'),
  btnCopyCommand: document.getElementById('btnCopyCommand'),
  
  consoleLog: document.getElementById('consoleLog'),
  btnAutoScroll: document.getElementById('btnAutoScroll'),
  btnClearConsole: document.getElementById('btnClearConsole'),
  
  toastContainer: document.getElementById('toastContainer'),
  
  hwVram: document.getElementById('hwVram'),
  
  chatIframeContainer: document.getElementById('chatIframeContainer'),
  hwRam: document.getElementById('hwRam'),
  hwRecommendationWrapper: document.getElementById('hwRecommendationWrapper'),

  // Link Processor Git Sync
  lpGitEnabled: document.getElementById('lp-git-enabled'),
  lpGitStatusText: document.getElementById('lp-git-status-text'),
  lpGitRepoPath: document.getElementById('lp-git-repo-path'),
  lpGitBranch: document.getElementById('lp-git-branch'),
  lpGitRemote: document.getElementById('lp-git-remote'),
  lpGitChanges: document.getElementById('lp-git-changes'),
  lpGitAheadBehind: document.getElementById('lp-git-ahead-behind'),
  lpGitChangesRow: document.getElementById('lp-git-changes-row'),
  lpGitAheadRow: document.getElementById('lp-git-ahead-row'),
  lpGitBtnSync: document.getElementById('lp-btn-git-sync'),
  lpGitHint: document.getElementById('lp-git-hint'),
  lpGitRepoInput: document.getElementById('lp-git-repo-input'),
  lpBtnBrowseGitRepo: document.getElementById('lp-btn-browse-git-repo'),
  lpBtnSaveGitRepo: document.getElementById('lp-btn-save-git-repo'),
  lpGitCard: document.getElementById('lp-git-card'),
  lpBtnBrowseInputFile: document.getElementById('lp-btn-browse-input-file'),
  lpBtnBrowseJournalsDir: document.getElementById('lp-btn-browse-journals-dir'),
  lpCategoryNew: document.getElementById('lp-category-new'),
  lpBtnCategoryAdd: document.getElementById('lp-btn-category-add'),
  hwRecommendationText: document.getElementById('hwRecommendationText'),
  hwRecommendationPlaceholder: document.getElementById('hwRecommendationPlaceholder'),
  btnApplyOptimization: document.getElementById('btnApplyOptimization'),
  autoStartServer: document.getElementById('autoStartServer'),
};

// Parameter Input IDs (matching HTML)
const paramIds = [
  'host', 'port', 'alias', 'parallel', 'apiKey', 'timeout', 'metrics',
  'contextSize', 'nPredict', 'noContextShift', 'chatTemplate', 'chatTemplateKwargs', 'jinja', 'mmproj',
  'gpuLayers', 'flashAttn', 'fit', 'fitTarget', 'splitMode', 'tensorSplit', 'mainGpu', 'cacheTypeK', 'cacheTypeV', 'cpuMoe', 'mlock', 'threads', 'batchSize',
  'temp', 'topK', 'topP', 'minP', 'repeatPenalty', 'presencePenalty', 'frequencyPenalty', 'seed', 'dryMultiplier', 'mirostat',
  'lora', 'ropeScaling', 'ropeScale', 'rpcServers', 'verbose', 'logFile', 'customArgs'
];

// Initialize
async function init() {
  await fetchConfig();
  await refreshModels();
  
  populateProfileDropdown();
  renderScanDirs();
  
  if (config.hardware) {
    if (config.hardware.vram !== undefined) DOM.hwVram.value = config.hardware.vram;
    if (config.hardware.ram !== undefined) DOM.hwRam.value = config.hardware.ram;
  }
  
  if (DOM.autoStartServer) {
    DOM.autoStartServer.checked = !!config.autoStart;
  }

  if (DOM.llamaServerPath) {
    DOM.llamaServerPath.value = config.llamaServerPath || '';
  }

  if (DOM.startWithWindows) {
    if (config.startWithWindows !== undefined) {
      DOM.startWithWindows.checked = !!config.startWithWindows;
    } else {
      fetch('/api/auto-start')
        .then(r => r.json())
        .then(data => { DOM.startWithWindows.checked = data.enabled; })
        .catch(() => {});
    }
  }
  
  if (DOM.modelSortBy) {
    DOM.modelSortBy.value = localStorage.getItem('llamalaunch_model_sort') || 'name_asc';
  }

  if (config.lastUsed && config.profiles[config.lastUsed]) {
    loadProfile(config.profiles[config.lastUsed]);
    DOM.profileSelect.value = config.lastUsed;
  }
  
  setupEventListeners();
  connectSSE();
  
  updateHardwareRecommendations();
  updateCommandPreview();
  pollStatus();
  setInterval(pollStatus, 3000);
  
  // Initialize Link Processor Tab
  initLinkProcessor();
}

// ---------------------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------------------

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      config = await res.json();
      if (!config.profiles) config.profiles = {};
      if (!config.scanDirs) config.scanDirs = [];
    }
  } catch (err) {
    console.error('Failed to fetch config', err);
    showToast('Failed to load configuration', 'error');
  }
}

async function saveConfig(patch) {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Network response was not ok');
    Object.assign(config, patch);
  } catch (err) {
    console.error('Failed to save config', err);
    showToast('Failed to save configuration', 'error');
  }
}

function parseFolderPaths(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const rawEntries = rawText.split(/[\r\n;]+/);
  const paths = [];
  for (const entry of rawEntries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // Match either quoted strings or non-comma chunks
    const matches = trimmed.match(/"[^"]+"|'[^']+'|[^,]+/g);
    if (matches) {
      for (let m of matches) {
        m = m.trim().replace(/^["']+|["']+$/g, '').trim();
        if (m) paths.push(m);
      }
    }
  }

  // Normalize slashes, convert file:// links, extract folder if file given, strip trailing slashes, deduplicate
  const unique = [];
  for (let p of paths) {
    p = p.trim();
    if (!p) continue;
    // Strip file:/// or file:// and decode
    if (/^file:\/\/\/?/i.test(p)) {
      try {
        p = decodeURIComponent(p.replace(/^file:\/\/\/?/i, ''));
      } catch {
        p = p.replace(/^file:\/\/\/?/i, '');
      }
    }
    // If user pasted a path pointing to a .gguf file, extract its containing directory
    if (/\.gguf$/i.test(p)) {
      p = p.replace(/[/\\][^/\\]+\.gguf$/i, '');
    }
    p = p.replace(/[/\\]+$/, '');
    if (p && !unique.some(u => u.toLowerCase() === p.toLowerCase())) {
      unique.push(p);
    }
  }
  return unique;
}

async function addScanDirs(newDirs) {
  if (!Array.isArray(newDirs) || newDirs.length === 0) return 0;
  if (!config.scanDirs) config.scanDirs = [];
  
  let addedCount = 0;
  for (const dir of newDirs) {
    if (dir && !config.scanDirs.some(d => d.toLowerCase() === dir.toLowerCase())) {
      config.scanDirs.push(dir);
      addedCount++;
    }
  }
  
  if (addedCount > 0) {
    await saveConfig({ scanDirs: config.scanDirs });
    renderScanDirs();
    await refreshModels();
  }
  return addedCount;
}

async function refreshModels() {
  try {
    const res = await fetch('/api/models');
    if (res.ok) {
      models = await res.json();
      populateModelDropdowns();
      renderScanDirs();
      if (DOM.modelPath && DOM.modelPath.value) {
        updateModelDetails(DOM.modelPath.value);
      }
    }
  } catch (err) {
    console.error('Failed to fetch models', err);
  }
}

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const status = await res.json();
      updateStatusUI(status);
    }
  } catch (err) {
    // Ignore fetch errors to avoid spamming console
  }
}

// ---------------------------------------------------------------------------
// UI Updates
// ---------------------------------------------------------------------------

function updateStatusUI(status) {
  const { state, port } = status;
  
  // Update Chat UI state based on server running status
  updateChatUIState(state === 'running', port);
  
  DOM.statusDot.className = 'status-dot';
  if (state === 'running') {
    DOM.statusDot.classList.add('status-running');
    DOM.statusText.textContent = `Running on :${port}`;
    DOM.btnStart.disabled = true;
    DOM.btnStop.disabled = false;
    DOM.btnOpenUI.disabled = false;
  } else if (state === 'starting') {
    DOM.statusDot.classList.add('status-starting');
    DOM.statusText.textContent = 'Starting...';
    DOM.btnStart.disabled = true;
    DOM.btnStop.disabled = false;
    DOM.btnOpenUI.disabled = true;
  } else if (state === 'stopping') {
    DOM.statusDot.classList.add('status-starting');
    DOM.statusText.textContent = 'Stopping...';
    DOM.btnStart.disabled = true;
    DOM.btnStop.disabled = true;
    DOM.btnOpenUI.disabled = true;
  } else if (state === 'error') {
    DOM.statusDot.classList.add('status-stopped');
    DOM.statusText.textContent = 'Error';
    DOM.btnStart.disabled = false;
    DOM.btnStop.disabled = true;
    DOM.btnOpenUI.disabled = true;
  } else {
    DOM.statusDot.classList.add('status-stopped');
    DOM.statusText.textContent = 'Stopped';
    DOM.btnStart.disabled = false;
    DOM.btnStop.disabled = true;
    DOM.btnOpenUI.disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Vision / Multimodal Projector (mmproj) Helpers
// ---------------------------------------------------------------------------

function setMmproj(path, notify = false) {
  const mmprojVal = (path || '').trim();
  const mmprojSelect = document.getElementById('mmproj');
  const sidebarSelect = DOM.sidebarMmprojSelect;
  const sidebarInput = DOM.sidebarMmprojPath;

  const ensureOption = (selectEl) => {
    if (!selectEl) return;
    if (!mmprojVal) {
      selectEl.value = '';
      return;
    }
    const exists = Array.from(selectEl.options).some(o => o.value === mmprojVal);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = mmprojVal;
      const baseName = mmprojVal.split(/[\\/]/).pop();
      const lastSlash = Math.max(mmprojVal.lastIndexOf('\\'), mmprojVal.lastIndexOf('/'));
      const dirName = lastSlash > 0 ? mmprojVal.substring(0, lastSlash) : '';
      opt.textContent = dirName ? `${baseName} (Custom) — 📁 ${dirName}` : `${baseName} (Custom)`;
      opt.dataset.custom = 'true';
      selectEl.appendChild(opt);
    }
    selectEl.value = mmprojVal;
  };

  ensureOption(mmprojSelect);
  ensureOption(sidebarSelect);
  if (sidebarInput) sidebarInput.value = mmprojVal;

  const hasMmproj = !!mmprojVal;
  if (DOM.btnClearMmproj) DOM.btnClearMmproj.style.display = hasMmproj ? 'inline-flex' : 'none';
  if (DOM.btnClearMmprojManual) DOM.btnClearMmprojManual.style.display = hasMmproj ? 'inline-flex' : 'none';
  if (DOM.btnClearMmprojTab) DOM.btnClearMmprojTab.style.display = hasMmproj ? 'inline-flex' : 'none';
  if (DOM.sidebarMmprojBadge) {
    DOM.sidebarMmprojBadge.classList.toggle('hidden', !hasMmproj);
  }

  updateCommandPreview();
  updateMmprojDetails(mmprojVal);

  if (notify && hasMmproj) {
    const baseName = mmprojVal.split(/[\\/]/).pop();
    showToast(`Vision projector attached: ${baseName}`, 'success');
  }
}

function clearMmproj() {
  setMmproj('');
  showToast('Vision projector removed (Text-only mode)', 'info');
}

async function browseForMmproj() {
  try {
    let initialDir = '';
    const currentModel = DOM.modelPath.value;
    if (currentModel) {
      const lastSlash = Math.max(currentModel.lastIndexOf('/'), currentModel.lastIndexOf('\\'));
      if (lastSlash > 0) initialDir = currentModel.substring(0, lastSlash);
    } else if (config.scanDirs && config.scanDirs.length > 0) {
      initialDir = config.scanDirs[0];
    }

    const res = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: 'Multimodal Projector (*.gguf)|*.gguf|All files (*.*)|*.*',
        title: 'Select Vision Projector (mmproj) GGUF',
        initialDir
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to browse for file');
    }
    const data = await res.json();
    if (data && data.path) {
      setMmproj(data.path, true);
    }
  } catch (err) {
    showToast(err.message || 'Failed to browse for vision projector', 'danger');
  }
}

async function browseForModel() {
  try {
    let initialDir = '';
    if (config.scanDirs && config.scanDirs.length > 0) {
      initialDir = config.scanDirs[0];
    }
    const res = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: 'GGUF Models (*.gguf)|*.gguf|All files (*.*)|*.*',
        title: 'Select GGUF Model',
        initialDir
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to browse for model');
    }
    const data = await res.json();
    if (data && data.path) {
      DOM.modelPath.value = data.path;
      const exists = Array.from(DOM.modelSelect.options).some(o => o.value === data.path);
      if (exists) {
        DOM.modelSelect.value = data.path;
      } else {
        const opt = document.createElement('option');
        opt.value = data.path;
        const baseName = data.path.split(/[\\/]/).pop();
        const lastSlash = Math.max(data.path.lastIndexOf('\\'), data.path.lastIndexOf('/'));
        const dirName = lastSlash > 0 ? data.path.substring(0, lastSlash) : '';
        opt.textContent = dirName ? `${baseName} (Custom) — 📁 ${dirName}` : `${baseName} (Custom)`;
        DOM.modelSelect.appendChild(opt);
        DOM.modelSelect.value = data.path;
      }
      updateCommandPreview();
      updateHardwareRecommendations();
      autoDetectMmprojForModel(data.path);
      updateModelDetails(data.path);
      showToast(`Selected model: ${data.path.split(/[\\/]/).pop()}`, 'success');
    }
  } catch (err) {
    showToast(err.message || 'Failed to browse for model', 'danger');
  }
}

function autoDetectMmprojForModel(modelFilePath) {
  if (!modelFilePath) {
    setMmproj('');
    return;
  }
  const mmprojModels = models.filter(m => m.isMultimodal);
  if (mmprojModels.length === 0) return;

  const normModelPath = modelFilePath.replace(/\\/g, '/').toLowerCase();
  const modelDir = normModelPath.substring(0, normModelPath.lastIndexOf('/'));
  const modelFileName = normModelPath.split('/').pop().replace(/\.gguf$/, '');

  // Strip quantization tags (e.g. -q4_k_m, -iq2_s, -bf16, -gsq, -rco, -ud)
  const cleanModelBase = modelFileName
    .replace(/-(iq\d+_[a-z\d]+|q\d+_[a-z\d_]+|fp\d+|bf\d+|f16|f32)/gi, '')
    .replace(/-(gsq|rco|ud|uncensored|distilled|instruct|chat)/gi, '')
    .toLowerCase();

  const modelTokens = cleanModelBase.match(/[a-z0-9.]+/g) || [];
  const genericTokens = new Set(['model', 'gguf', 'instruct', 'chat', 'v', 'it', 'ai']);
  const meaningfulTokens = modelTokens.filter(t => !genericTokens.has(t) && t.length >= 2);

  let bestMatch = null;
  let bestScore = -1;

  for (const m of mmprojModels) {
    const normProjPath = m.path.replace(/\\/g, '/').toLowerCase();
    const projDir = normProjPath.substring(0, normProjPath.lastIndexOf('/'));
    const projFileName = m.name.replace(/\.gguf$/, '').toLowerCase();

    let score = 0;

    // Check directory match: same directory
    if (projDir && modelDir && projDir === modelDir) {
      score += 60;
    }

    // Check token overlap
    const projTokens = projFileName.match(/[a-z0-9.]+/g) || [];
    for (const t of meaningfulTokens) {
      if (projTokens.includes(t) || projFileName.includes(t)) {
        if (/\d/.test(t)) score += 30;
        else score += 15;
      }
    }

    // Penalty if model has distinct parameter size and projector has mismatched size (e.g. 27b vs 7b)
    const modelSizeMatch = cleanModelBase.match(/(\d+(?:\.\d+)?[bm])/);
    const projSizeMatch = projFileName.match(/(\d+(?:\.\d+)?[bm])/);
    if (modelSizeMatch && projSizeMatch && modelSizeMatch[1] !== projSizeMatch[1]) {
      score -= 60;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = m;
    }
  }

  if (bestMatch && bestScore >= 40) {
    setMmproj(bestMatch.path);
    showToast(`Auto-attached vision projector: ${bestMatch.name}`, 'info');
  } else {
    setMmproj('');
  }
}

function updateModelDetails(modelPath) {
  const bar = document.getElementById('modelDetailsBar');
  const sizeEl = document.getElementById('modelDetailSize');
  const locEl = document.getElementById('modelDetailLocation');
  const locWrap = document.getElementById('modelDetailLocationWrapper');
  if (!bar || !sizeEl || !locEl) return;

  if (!modelPath) {
    bar.classList.add('hidden');
    return;
  }

  const model = models.find(m => m.path && m.path.toLowerCase() === modelPath.toLowerCase());
  if (model) {
    sizeEl.textContent = model.sizeHuman || 'Unknown size';
    const folderPath = model.dir || model.folder || '';
    locEl.textContent = folderPath || 'Local folder';
    if (locWrap) {
      locWrap.dataset.dir = folderPath;
      locWrap.title = `📁 ${model.path}\nClick to open folder in File Explorer`;
    }
    bar.classList.remove('hidden');
  } else {
    const lastSlash = Math.max(modelPath.lastIndexOf('\\'), modelPath.lastIndexOf('/'));
    const dir = lastSlash > 0 ? modelPath.substring(0, lastSlash) : modelPath;
    sizeEl.textContent = 'Custom file';
    locEl.textContent = dir || 'Custom path';
    if (locWrap) {
      locWrap.dataset.dir = dir;
      locWrap.title = `📁 ${modelPath}\nClick to open folder in File Explorer`;
    }
    bar.classList.remove('hidden');
  }
}

function updateMmprojDetails(mmprojPath) {
  const bar = document.getElementById('sidebarMmprojDetailsBar');
  const sizeEl = document.getElementById('sidebarMmprojDetailSize');
  const locEl = document.getElementById('sidebarMmprojDetailLocation');
  const locWrap = document.getElementById('sidebarMmprojDetailLocationWrapper');
  if (!bar || !sizeEl || !locEl) return;

  if (!mmprojPath) {
    bar.classList.add('hidden');
    return;
  }

  const proj = models.find(m => m.path && m.path.toLowerCase() === mmprojPath.toLowerCase());
  if (proj) {
    sizeEl.textContent = proj.sizeHuman || 'Unknown size';
    const folderPath = proj.dir || proj.folder || '';
    locEl.textContent = folderPath || 'Local folder';
    if (locWrap) {
      locWrap.dataset.dir = folderPath;
      locWrap.title = `📁 ${proj.path}\nClick to open folder in File Explorer`;
    }
    bar.classList.remove('hidden');
  } else {
    const lastSlash = Math.max(mmprojPath.lastIndexOf('\\'), mmprojPath.lastIndexOf('/'));
    const dir = lastSlash > 0 ? mmprojPath.substring(0, lastSlash) : mmprojPath;
    sizeEl.textContent = 'Custom mmproj';
    locEl.textContent = dir || 'Custom path';
    if (locWrap) {
      locWrap.dataset.dir = dir;
      locWrap.title = `📁 ${mmprojPath}\nClick to open folder in File Explorer`;
    }
    bar.classList.remove('hidden');
  }
}

function populateModelDropdowns() {
  const regularModels = models.filter(m => !m.isMultimodal);
  const mmprojModels = models.filter(m => m.isMultimodal);

  const currentModelSort = DOM.modelSortBy ? DOM.modelSortBy.value : (localStorage.getItem('llamalaunch_model_sort') || 'name_asc');
  const searchQuery = (DOM.modelSearchInput ? DOM.modelSearchInput.value : '').trim().toLowerCase();

  if (DOM.btnClearModelSearch) {
    DOM.btnClearModelSearch.classList.toggle('hidden', !searchQuery);
  }

  // 1. Sort regular models according to selected order
  let sortedRegular = [...regularModels];
  switch (currentModelSort) {
    case 'name_desc':
      sortedRegular.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base', numeric: true }));
      break;
    case 'size_desc':
      sortedRegular.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case 'size_asc':
      sortedRegular.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
    case 'location':
      sortedRegular.sort((a, b) => {
        const folderA = a.dir || a.folder || '';
        const folderB = b.dir || b.folder || '';
        const fComp = folderA.localeCompare(folderB, undefined, { sensitivity: 'base' });
        if (fComp !== 0) return fComp;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      });
      break;
    case 'name_asc':
    default:
      sortedRegular.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      break;
  }

  // 2. Filter if search query entered
  if (searchQuery) {
    const tokens = searchQuery.split(/\s+/).filter(Boolean);
    sortedRegular = sortedRegular.filter(m => {
      const searchTarget = `${m.name} ${m.sizeHuman || ''} ${m.dir || ''} ${m.folder || ''} ${m.path || ''}`.toLowerCase();
      return tokens.every(t => searchTarget.includes(t));
    });
  }

  // 3. Build Model Select HTML
  let modelHtml = '<option value="">— Select a model —</option>';
  if (sortedRegular.length === 0 && searchQuery) {
    modelHtml += `<option value="" disabled>⚠️ No models match "${escapeHtml(searchQuery)}"</option>`;
  } else if (sortedRegular.length > 0) {
    if (currentModelSort === 'location') {
      const groups = {};
      sortedRegular.forEach(m => {
        const folderKey = m.dir || m.folder || 'GGUF Models';
        if (!groups[folderKey]) groups[folderKey] = [];
        groups[folderKey].push(m);
      });

      const folderNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      folderNames.forEach(folder => {
        const count = groups[folder].length;
        modelHtml += `<optgroup label="📁 ${escapeHtml(folder)} (${count} model${count === 1 ? '' : 's'})">`;
        groups[folder].forEach(m => {
          const folderLabel = m.dir || m.folder || folder;
          const sizeTag = m.sizeHuman ? `[${m.sizeHuman}]` : '';
          modelHtml += `<option value="${escapeHtml(m.path)}">${escapeHtml(m.name)}  ${escapeHtml(sizeTag)}  —  📁 ${escapeHtml(folderLabel)}</option>`;
        });
        modelHtml += '</optgroup>';
      });
    } else if (currentModelSort === 'size_desc' || currentModelSort === 'size_asc') {
      const isDesc = currentModelSort === 'size_desc';
      const label = isDesc
        ? `📉 Size: Largest to Smallest (${sortedRegular.length} models)`
        : `📈 Size: Smallest to Largest (${sortedRegular.length} models)`;
      modelHtml += `<optgroup label="${label}">`;
      sortedRegular.forEach(m => {
        const folderLabel = m.dir || m.folder || (m.path ? m.path.substring(0, Math.max(m.path.lastIndexOf('\\'), m.path.lastIndexOf('/'))) : '');
        const sizeTag = m.sizeHuman ? `[${m.sizeHuman}]` : '';
        modelHtml += `<option value="${escapeHtml(m.path)}">${escapeHtml(sizeTag)}  ${escapeHtml(m.name)}  —  📁 ${escapeHtml(folderLabel)}</option>`;
      });
      modelHtml += '</optgroup>';
    } else {
      const isAsc = currentModelSort === 'name_asc';
      const label = isAsc
        ? `🔤 Alphabetical (A → Z) (${sortedRegular.length} models)`
        : `🔤 Alphabetical (Z → A) (${sortedRegular.length} models)`;
      modelHtml += `<optgroup label="${label}">`;
      sortedRegular.forEach(m => {
        const folderLabel = m.dir || m.folder || (m.path ? m.path.substring(0, Math.max(m.path.lastIndexOf('\\'), m.path.lastIndexOf('/'))) : '');
        const sizeTag = m.sizeHuman ? `[${m.sizeHuman}]` : '';
        modelHtml += `<option value="${escapeHtml(m.path)}">${escapeHtml(m.name)}  ${escapeHtml(sizeTag)}  —  📁 ${escapeHtml(folderLabel)}</option>`;
      });
      modelHtml += '</optgroup>';
    }
  }
  DOM.modelSelect.innerHTML = modelHtml;
  
  // Current active mmproj
  const currentMmproj = document.getElementById('mmproj')?.value || DOM.sidebarMmprojPath?.value || '';

  // MMProj Select
  const mmprojSelect = document.getElementById('mmproj');
  let mmprojHtml = '<option value="">— None (Text Only) —</option>';
  if (mmprojModels.length > 0) {
    const mmGroups = {};
    mmprojModels.forEach(m => {
      const folderKey = m.dir || m.folder || (m.path ? m.path.substring(0, Math.max(m.path.lastIndexOf('\\'), m.path.lastIndexOf('/'))) : '') || 'Vision / Multimodal';
      if (!mmGroups[folderKey]) mmGroups[folderKey] = [];
      mmGroups[folderKey].push(m);
    });
    const mmFolders = Object.keys(mmGroups).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    mmFolders.forEach(folder => {
      const count = mmGroups[folder].length;
      mmprojHtml += `<optgroup label="👁️ ${escapeHtml(folder)} (${count} projector${count === 1 ? '' : 's'})">`;
      mmGroups[folder].forEach(m => {
        const folderLabel = m.dir || m.folder || folder;
        const sizeTag = m.sizeHuman ? `[${m.sizeHuman}]` : '';
        mmprojHtml += `<option value="${escapeHtml(m.path)}">${escapeHtml(m.name)}  ${escapeHtml(sizeTag)}  —  📁 ${escapeHtml(folderLabel)}</option>`;
      });
      mmprojHtml += '</optgroup>';
    });
  }
  if (mmprojSelect) mmprojSelect.innerHTML = mmprojHtml;
  if (DOM.sidebarMmprojSelect) DOM.sidebarMmprojSelect.innerHTML = mmprojHtml;

  // Restore selections if possible
  const currentModel = DOM.modelPath.value;
  if (currentModel) {
    const exists = Array.from(DOM.modelSelect.options).some(o => o.value === currentModel);
    if (exists) {
      DOM.modelSelect.value = currentModel;
    }
    updateModelDetails(currentModel);
  } else {
    updateModelDetails('');
  }

  if (currentMmproj) {
    setMmproj(currentMmproj, false);
  } else {
    updateMmprojDetails('');
  }
}

function stepModel(direction = 1) {
  const select = DOM.modelSelect;
  if (!select) return;
  const options = Array.from(select.options).filter(opt => opt.value !== '' && !opt.disabled);
  if (options.length === 0) return;

  const currentVal = DOM.modelPath.value || select.value;
  let currentIndex = options.findIndex(opt => opt.value.toLowerCase() === currentVal.toLowerCase());

  let newIndex = 0;
  if (currentIndex === -1) {
    newIndex = direction > 0 ? 0 : options.length - 1;
  } else {
    newIndex = (currentIndex + direction + options.length) % options.length;
  }

  const targetOpt = options[newIndex];
  if (targetOpt) {
    select.value = targetOpt.value;
    DOM.modelPath.value = targetOpt.value;
    updateCommandPreview();
    updateHardwareRecommendations();
    autoDetectMmprojForModel(targetOpt.value);
    updateModelDetails(targetOpt.value);

    const baseName = targetOpt.value.split(/[\\/]/).pop();
    const modelObj = models.find(m => m.path.toLowerCase() === targetOpt.value.toLowerCase());
    const sizeStr = modelObj ? ` [${modelObj.sizeHuman}]` : '';
    showToast(`Model (${newIndex + 1}/${options.length}): ${baseName}${sizeStr}`, 'info');
  }
}

function populateProfileDropdown() {
  let html = '<option value="">— Select profile —</option>';
  for (const name of Object.keys(config.profiles).sort()) {
    html += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
  }
  DOM.profileSelect.innerHTML = html;
}

function renderScanDirs() {
  DOM.scanDirsList.innerHTML = '';
  config.scanDirs.forEach(dir => {
    const el = document.createElement('div');
    el.className = 'scan-dir-pill';
    
    // Count models under this directory
    const count = models ? models.filter(m => {
      if (m.rootDir && m.rootDir.toLowerCase() === dir.toLowerCase()) return true;
      if (m.path && m.path.toLowerCase().startsWith(dir.toLowerCase())) return true;
      return false;
    }).length : 0;
    const countTag = count > 0 ? ` <span style="opacity:0.65;font-size:0.7rem;">(${count})</span>` : '';

    el.innerHTML = `
      <span title="${escapeHtml(dir)}" class="scan-dir-text">${escapeHtml(dir)}${countTag}</span>
      <button class="open-dir" data-dir="${escapeHtml(dir)}" title="Open in File Explorer">📂</button>
      <button class="remove-dir" data-dir="${escapeHtml(dir)}" title="Remove directory">×</button>
    `;
    DOM.scanDirsList.appendChild(el);
  });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  DOM.toastContainer.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
  // Auto-start server setting toggle
  if (DOM.autoStartServer) {
    DOM.autoStartServer.addEventListener('change', (e) => {
      saveConfig({ autoStart: e.target.checked });
    });
  }

  // Start with Windows toggle
  if (DOM.startWithWindows) {
    DOM.startWithWindows.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/api/auto-start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        if (!res.ok) throw new Error('Failed to update');
        await saveConfig({ startWithWindows: enabled });
        showToast(`Start with Windows ${enabled ? 'enabled' : 'disabled'}`, 'success');
      } catch (err) {
        console.error('Failed to set start with Windows:', err);
        showToast('Failed to update Start with Windows', 'error');
        DOM.startWithWindows.checked = !enabled;
      }
    });
  }

  // Llama-server path input
  if (DOM.llamaServerPath) {
    DOM.llamaServerPath.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      saveConfig({ llamaServerPath: val });
      updateCommandPreview();
    });
  }

  // Browse for llama-server.exe
  if (DOM.btnBrowseLlamaServer) {
    DOM.btnBrowseLlamaServer.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/browse-file', { method: 'POST' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to browse for file');
        }
        const data = await res.json();
        if (data && data.path && DOM.llamaServerPath) {
          DOM.llamaServerPath.value = data.path;
          saveConfig({ llamaServerPath: data.path });
          showToast('llama-server path set', 'success');
        }
      } catch (err) {
        showToast(err.message || 'Failed to browse for file', 'danger');
      }
    });
  }

  // Tabs
  DOM.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.tabButtons.forEach(b => b.classList.remove('active', 'glow'));
      DOM.tabPanels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('aria-controls')).classList.add('active');
    });
  });

  // Toggle model input method
  let manualModelInput = false;
  DOM.toggleModelInput.addEventListener('click', (e) => {
    e.preventDefault();
    manualModelInput = !manualModelInput;
    if (manualModelInput) {
      DOM.modelSelectWrapper.classList.add('hidden');
      DOM.modelPathWrapper.classList.remove('hidden');
      DOM.toggleModelInput.textContent = 'Select from scanned directories';
    } else {
      DOM.modelSelectWrapper.classList.remove('hidden');
      DOM.modelPathWrapper.classList.add('hidden');
      DOM.toggleModelInput.textContent = 'Enter path manually';
    }
  });

  // Manage / Add folders link
  if (DOM.btnBrowseModelDirLink) {
    DOM.btnBrowseModelDirLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (DOM.btnOpenBulkScanDirs) {
        DOM.btnOpenBulkScanDirs.click();
      }
    });
  }

  // Rescan model folders
  if (DOM.btnRefreshModels) {
    DOM.btnRefreshModels.addEventListener('click', async (e) => {
      e.preventDefault();
      DOM.btnRefreshModels.disabled = true;
      try {
        await refreshModels();
        showToast('Model folders rescanned', 'success');
      } catch (err) {
        console.error('Error rescannning model folders:', err);
        showToast('Failed to rescan model folders', 'error');
      } finally {
        DOM.btnRefreshModels.disabled = false;
      }
    });
  }

  // Browse for Model file
  if (DOM.btnBrowseModelFile) {
    DOM.btnBrowseModelFile.addEventListener('click', (e) => {
      e.preventDefault();
      browseForModel();
    });
  }
  if (DOM.btnBrowseModelFileManual) {
    DOM.btnBrowseModelFileManual.addEventListener('click', (e) => {
      e.preventDefault();
      browseForModel();
    });
  }

  // Model Sort Dropdown
  if (DOM.modelSortBy) {
    DOM.modelSortBy.addEventListener('change', (e) => {
      const sortVal = e.target.value;
      localStorage.setItem('llamalaunch_model_sort', sortVal);
      populateModelDropdowns();
      const sortLabels = {
        name_asc: 'Alphabetical (A → Z)',
        name_desc: 'Alphabetical (Z → A)',
        size_desc: 'Size (Largest first)',
        size_asc: 'Size (Smallest first)',
        location: 'Grouped by Location'
      };
      showToast(`Sorted models: ${sortLabels[sortVal] || sortVal}`, 'info');
    });
  }

  // Prev / Next Model Navigation Buttons
  if (DOM.btnPrevModel) {
    DOM.btnPrevModel.addEventListener('click', (e) => {
      e.preventDefault();
      stepModel(-1);
    });
  }
  if (DOM.btnNextModel) {
    DOM.btnNextModel.addEventListener('click', (e) => {
      e.preventDefault();
      stepModel(1);
    });
  }

  // Model Live Search Input
  if (DOM.modelSearchInput) {
    DOM.modelSearchInput.addEventListener('input', () => {
      populateModelDropdowns();
    });
    DOM.modelSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        stepModel(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        DOM.modelSearchInput.value = '';
        populateModelDropdowns();
      }
    });
  }
  if (DOM.btnClearModelSearch) {
    DOM.btnClearModelSearch.addEventListener('click', () => {
      if (DOM.modelSearchInput) {
        DOM.modelSearchInput.value = '';
        DOM.modelSearchInput.focus();
      }
      populateModelDropdowns();
    });
  }

  // Sync Model Select <-> Model Path
  DOM.modelSelect.addEventListener('change', (e) => {
    DOM.modelPath.value = e.target.value;
    updateCommandPreview();
    updateHardwareRecommendations();
    autoDetectMmprojForModel(e.target.value);
    updateModelDetails(e.target.value);
  });
  
  DOM.modelPath.addEventListener('input', () => {
    DOM.modelSelect.value = ""; // Clear select if manual input changes
    updateCommandPreview();
    updateHardwareRecommendations();
    autoDetectMmprojForModel(DOM.modelPath.value);
    updateModelDetails(DOM.modelPath.value);
  });

  // Clicking folder location in details bar opens in File Explorer
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.model-detail-clickable');
    if (item && item.dataset.dir) {
      fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: item.dataset.dir })
      }).then(res => {
        if (res.ok) showToast('Opened folder in File Explorer', 'info');
      }).catch(() => {});
    }
  });

  // Multimodal / Vision Projector (mmproj) Controls
  if (DOM.sidebarMmprojSelect) {
    DOM.sidebarMmprojSelect.addEventListener('change', (e) => setMmproj(e.target.value));
  }
  if (DOM.sidebarMmprojPath) {
    DOM.sidebarMmprojPath.addEventListener('input', (e) => setMmproj(e.target.value));
  }
  const tabMmproj = document.getElementById('mmproj');
  if (tabMmproj) {
    tabMmproj.addEventListener('change', (e) => setMmproj(e.target.value));
  }

  // Browse MMProj buttons
  if (DOM.btnBrowseMmproj) {
    DOM.btnBrowseMmproj.addEventListener('click', (e) => { e.preventDefault(); browseForMmproj(); });
  }
  if (DOM.btnBrowseMmprojManual) {
    DOM.btnBrowseMmprojManual.addEventListener('click', (e) => { e.preventDefault(); browseForMmproj(); });
  }
  if (DOM.btnBrowseMmprojTab) {
    DOM.btnBrowseMmprojTab.addEventListener('click', (e) => { e.preventDefault(); browseForMmproj(); });
  }

  // Clear MMProj buttons
  if (DOM.btnClearMmproj) {
    DOM.btnClearMmproj.addEventListener('click', (e) => { e.preventDefault(); clearMmproj(); });
  }
  if (DOM.btnClearMmprojManual) {
    DOM.btnClearMmprojManual.addEventListener('click', (e) => { e.preventDefault(); clearMmproj(); });
  }
  if (DOM.btnClearMmprojTab) {
    DOM.btnClearMmprojTab.addEventListener('click', (e) => { e.preventDefault(); clearMmproj(); });
  }

  // Toggle MMProj manual input
  let manualMmprojInput = false;
  if (DOM.toggleMmprojInput) {
    DOM.toggleMmprojInput.addEventListener('click', (e) => {
      e.preventDefault();
      manualMmprojInput = !manualMmprojInput;
      if (manualMmprojInput) {
        DOM.sidebarMmprojSelectWrapper.classList.add('hidden');
        DOM.sidebarMmprojPathWrapper.classList.remove('hidden');
        DOM.toggleMmprojInput.textContent = 'Select from list';
      } else {
        DOM.sidebarMmprojSelectWrapper.classList.remove('hidden');
        DOM.sidebarMmprojPathWrapper.classList.add('hidden');
        DOM.toggleMmprojInput.textContent = 'Manual path';
      }
    });
  }

  // Any input change -> update preview & check context
  paramIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      updateCommandPreview();
      if (id === 'contextSize') updateHardwareRecommendations();
    });
    el.addEventListener('change', () => {
      updateCommandPreview();
      if (id === 'contextSize') updateHardwareRecommendations();
    });
  });

  // Slider syncing
  const sliders = document.querySelectorAll('input[type="range"].slider');
  sliders.forEach(slider => {
    const numInput = document.getElementById(slider.id.replace('Range', ''));
    if (numInput) {
      slider.addEventListener('input', () => {
        numInput.value = slider.value;
        updateCommandPreview();
      });
      numInput.addEventListener('input', () => {
        slider.value = numInput.value;
        updateCommandPreview();
      });
    }
  });

  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const val = btn.getAttribute('data-value');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.value = val;
        updateCommandPreview();
        if (targetId === 'contextSize') updateHardwareRecommendations();
      }
    });
  });

  // Hardware profile inputs
  let hwSaveTimeout = null;
  const onHwChange = () => {
    updateHardwareRecommendations();
    clearTimeout(hwSaveTimeout);
    hwSaveTimeout = setTimeout(() => {
      saveConfig({
        hardware: {
          vram: parseFloat(DOM.hwVram.value) || 12,
          ram: parseFloat(DOM.hwRam.value) || 64
        }
      });
    }, 1000);
  };
  DOM.hwVram.addEventListener('input', onHwChange);
  DOM.hwRam.addEventListener('input', onHwChange);

  // Apply Optimization Button
  DOM.btnApplyOptimization.addEventListener('click', () => {
    applyHardwareOptimizations();
  });

  // Quick Actions
  DOM.btnStart.addEventListener('click', async () => {
    DOM.btnStart.disabled = true;
    try {
      const pathRes = await fetch('/api/llama-server-path');
      if (pathRes.ok) {
        const pathData = await pathRes.json();
        if (!pathData.exists) {
          showToast(`llama-server not found at: ${pathData.path} — please set the correct path in Server settings.`, 'error');
          DOM.btnStart.disabled = false;
          return;
        }
      }

      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: currentArgsArray })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      showToast('Server starting...', 'success');
      // Save lastUsed on start
      const currentProfileName = DOM.profileSelect.value;
      if (currentProfileName) {
        saveConfig({ lastUsed: currentProfileName });
      }
    } catch (err) {
      showToast(err.message, 'error');
      DOM.btnStart.disabled = false;
    }
  });

  DOM.btnStop.addEventListener('click', async () => {
    try {
      await fetch('/api/stop', { method: 'POST' });
      showToast('Stop signal sent', 'success');
    } catch (err) {
      showToast('Failed to stop server', 'error');
    }
  });

  DOM.btnOpenUI.addEventListener('click', () => {
    const host = document.getElementById('host').value || '127.0.0.1';
    const port = document.getElementById('port').value || 8085;
    const cleanHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    window.open(`http://${cleanHost}:${port}`, '_blank');
  });

  DOM.btnCopyCommand.addEventListener('click', () => {
    const { displayString } = buildCommand();
    navigator.clipboard.writeText(displayString).then(() => {
      showToast('Command copied to clipboard', 'success');
    });
  });

  // Console Actions
  DOM.btnClearConsole.addEventListener('click', () => {
    DOM.consoleLog.innerHTML = '';
  });
  
  DOM.btnAutoScroll.addEventListener('click', () => {
    isAutoScroll = !isAutoScroll;
    if (isAutoScroll) {
      DOM.btnAutoScroll.classList.add('btn-icon-active');
      DOM.consoleLog.scrollTop = DOM.consoleLog.scrollHeight;
    } else {
      DOM.btnAutoScroll.classList.remove('btn-icon-active');
    }
  });

  DOM.consoleLog.addEventListener('scroll', () => {
    // If user scrolls up, disable auto-scroll
    const atBottom = Math.abs(DOM.consoleLog.scrollHeight - DOM.consoleLog.scrollTop - DOM.consoleLog.clientHeight) < 10;
    if (!atBottom && isAutoScroll) {
      isAutoScroll = false;
      DOM.btnAutoScroll.classList.remove('btn-icon-active');
    } else if (atBottom && !isAutoScroll) {
      isAutoScroll = true;
      DOM.btnAutoScroll.classList.add('btn-icon-active');
    }
  });

  // Profiles
  DOM.profileSelect.addEventListener('change', (e) => {
    const name = e.target.value;
    if (name && config.profiles[name]) {
      loadProfile(config.profiles[name]);
      updateCommandPreview();
      updateHardwareRecommendations();
      saveConfig({ lastUsed: name });
    }
  });

  DOM.btnSaveProfile.addEventListener('click', () => {
    const currentName = DOM.profileSelect.value;
    if (!currentName) {
      DOM.btnSaveAsProfile.click();
      return;
    }
    const profile = gatherFormValues();
    config.profiles[currentName] = profile;
    saveConfig({ profiles: config.profiles, lastUsed: currentName });
    showToast(`Profile "${currentName}" saved`, 'success');
  });

  DOM.btnSaveAsProfile.addEventListener('click', () => {
    const name = prompt('Enter new profile name:');
    if (!name || !name.trim()) return;
    const profile = gatherFormValues();
    config.profiles[name.trim()] = profile;
    populateProfileDropdown();
    DOM.profileSelect.value = name.trim();
    saveConfig({ profiles: config.profiles, lastUsed: name.trim() });
    showToast(`Profile "${name.trim()}" created`, 'success');
  });

  DOM.btnDeleteProfile.addEventListener('click', () => {
    const name = DOM.profileSelect.value;
    if (!name) return;
    if (confirm(`Are you sure you want to delete the profile "${name}"?`)) {
      delete config.profiles[name];
      populateProfileDropdown();
      DOM.profileSelect.value = '';
      saveConfig({ profiles: config.profiles });
      showToast(`Profile "${name}" deleted`, 'success');
    }
  });

  // Scan Dirs — Single or Multiple Path Addition
  DOM.btnBrowseScanDir.addEventListener('click', async () => {
    DOM.btnBrowseScanDir.disabled = true;
    const oldHtml = DOM.btnBrowseScanDir.innerHTML;
    DOM.btnBrowseScanDir.innerHTML = '⌛';
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to browse folder');
      }
      const data = await res.json();
      if (data && data.path) {
        const count = await addScanDirs([data.path]);
        if (count > 0) {
          showToast(`Added folder: ${data.path}`, 'success');
        } else {
          showToast(`Folder already in scan list: ${data.path}`, 'info');
        }
      } else {
        showToast('No folder selected.', 'info');
      }
    } catch (err) {
      console.error('Error browsing folder:', err);
      showToast(err.message || 'Failed to browse folder', 'danger');
    } finally {
      DOM.btnBrowseScanDir.disabled = false;
      DOM.btnBrowseScanDir.innerHTML = oldHtml;
    }
  });

  async function handleAddScanDirInput() {
    const raw = DOM.scanDirInput.value.trim();
    if (!raw) return;
    const paths = parseFolderPaths(raw);
    if (paths.length === 0) return;

    const count = await addScanDirs(paths);
    DOM.scanDirInput.value = '';
    if (count > 1) {
      showToast(`Added ${count} directories`, 'success');
    } else if (count === 1) {
      showToast(`Directory added: ${paths[0]}`, 'success');
    } else {
      showToast('Directory already in scan list', 'info');
    }
  }

  DOM.btnAddScanDir.addEventListener('click', handleAddScanDirInput);
  DOM.scanDirInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddScanDirInput();
    }
  });

  // Bulk Scan Directories Modal Handlers
  if (DOM.btnOpenBulkScanDirs) {
    DOM.btnOpenBulkScanDirs.addEventListener('click', () => {
      DOM.bulkScanDirsModal.classList.remove('hidden');
      DOM.bulkScanDirsInput.value = '';
      DOM.bulkScanDirsCount.textContent = '0 paths detected';
      setTimeout(() => DOM.bulkScanDirsInput.focus(), 50);
    });
  }

  function closeBulkScanModal() {
    if (DOM.bulkScanDirsModal) DOM.bulkScanDirsModal.classList.add('hidden');
  }

  if (DOM.btnCloseBulkScanDirs) DOM.btnCloseBulkScanDirs.addEventListener('click', closeBulkScanModal);
  if (DOM.btnCancelBulkScanDirs) DOM.btnCancelBulkScanDirs.addEventListener('click', closeBulkScanModal);

  if (DOM.bulkScanDirsModal) {
    DOM.bulkScanDirsModal.addEventListener('click', (e) => {
      if (e.target === DOM.bulkScanDirsModal) closeBulkScanModal();
    });
  }

  if (DOM.bulkScanDirsInput) {
    DOM.bulkScanDirsInput.addEventListener('input', () => {
      const paths = parseFolderPaths(DOM.bulkScanDirsInput.value);
      DOM.bulkScanDirsCount.textContent = `${paths.length} path${paths.length === 1 ? '' : 's'} detected`;
    });
  }

  if (DOM.btnBrowseAddToBulk) {
    DOM.btnBrowseAddToBulk.addEventListener('click', async () => {
      try {
        DOM.btnBrowseAddToBulk.disabled = true;
        const oldHtml = DOM.btnBrowseAddToBulk.innerHTML;
        DOM.btnBrowseAddToBulk.innerHTML = '⏳ Opening...';
        try {
          const res = await fetch('/api/browse-folder', { method: 'POST' });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to browse folder');
          }
          const data = await res.json();
          if (data && data.path) {
            const current = DOM.bulkScanDirsInput.value.trim();
            DOM.bulkScanDirsInput.value = current ? `${current}\n${data.path}` : data.path;
            const paths = parseFolderPaths(DOM.bulkScanDirsInput.value);
            DOM.bulkScanDirsCount.textContent = `${paths.length} path${paths.length === 1 ? '' : 's'} detected`;
            showToast(`Added to list: ${data.path}`, 'info');
          }
        } finally {
          DOM.btnBrowseAddToBulk.disabled = false;
          DOM.btnBrowseAddToBulk.innerHTML = oldHtml;
        }
      } catch (err) {
        showToast(err.message || 'Failed to browse folder', 'danger');
      }
    });
  }

  if (DOM.btnAddAllBulkScanDirs) {
    DOM.btnAddAllBulkScanDirs.addEventListener('click', async () => {
      const raw = DOM.bulkScanDirsInput ? DOM.bulkScanDirsInput.value.trim() : '';
      if (!raw) {
        showToast('Please enter or paste at least one folder path', 'info');
        return;
      }
      // Check if user pasted web links instead of local paths
      if (/^https?:\/\//i.test(raw)) {
        showToast('Web links (http/https) are not local folders. Please paste folder paths on your computer (e.g. E:\\AI\\GGUF)', 'danger');
        return;
      }
      const paths = parseFolderPaths(raw);
      if (paths.length === 0) {
        showToast('No valid folder paths detected', 'info');
        return;
      }
      const count = await addScanDirs(paths);
      closeBulkScanModal();
      if (count > 0) {
        showToast(`Added ${count} folder${count === 1 ? '' : 's'} and rescanned models`, 'success');
      } else {
        showToast('All specified folders were already in the scan list', 'info');
      }
    });
  }

  if (DOM.btnClearAllScanDirs) {
    DOM.btnClearAllScanDirs.addEventListener('click', async () => {
      if (confirm('Are you sure you want to remove ALL scan directories?')) {
        config.scanDirs = [];
        await saveConfig({ scanDirs: [] });
        renderScanDirs();
        await refreshModels();
        closeBulkScanModal();
        showToast('All scan directories cleared', 'success');
      }
    });
  }

  DOM.scanDirsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-dir')) {
      const dir = e.target.getAttribute('data-dir');
      config.scanDirs = config.scanDirs.filter(d => d !== dir);
      await saveConfig({ scanDirs: config.scanDirs });
      renderScanDirs();
      await refreshModels();
      showToast('Directory removed', 'success');
    } else if (e.target.classList.contains('open-dir') || e.target.classList.contains('scan-dir-text')) {
      const dir = e.target.getAttribute('data-dir') || e.target.getAttribute('title');
      if (dir) {
        try {
          const res = await fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: dir })
          });
          if (res.ok) {
            showToast(`Opened folder in File Explorer`, 'info');
          } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'Failed to open folder', 'error');
          }
        } catch (err) {
          showToast('Failed to open folder', 'error');
        }
      }
    }
  });

}

// ---------------------------------------------------------------------------
// Form State Management
// ---------------------------------------------------------------------------

function gatherFormValues() {
  const profile = {};
  profile.model = DOM.modelPath.value;
  
  paramIds.forEach(id => {
    if (id === 'model') return;
    const el = document.getElementById(id);
    if (!el) return;
    
    if (el.type === 'checkbox') {
      profile[id] = el.checked;
    } else if (el.type === 'number' || el.type === 'range') {
      const val = parseFloat(el.value);
      profile[id] = isNaN(val) ? el.value : val;
    } else {
      profile[id] = el.value;
    }
  });
  return profile;
}

function loadProfile(profile) {
  DOM.modelPath.value = profile.model || '';
  // Try to sync select
  const exists = Array.from(DOM.modelSelect.options).some(o => o.value === profile.model);
  if (exists) DOM.modelSelect.value = profile.model;
  else DOM.modelSelect.value = "";
  
  updateModelDetails(profile.model || '');
  setMmproj(profile.mmproj || '');
  
  paramIds.forEach(id => {
    if (id === 'model' || profile[id] === undefined) return;
    const el = document.getElementById(id);
    if (!el) return;
    
    if (el.type === 'checkbox') {
      el.checked = profile[id];
    } else {
      el.value = profile[id];
      // Sync slider if exists
      const slider = document.getElementById(`${id}Range`);
      if (slider) slider.value = profile[id];
    }
  });
}

// ---------------------------------------------------------------------------
// Command Builder
// ---------------------------------------------------------------------------

function buildCommand() {
  const args = [];
  
  const getVal = (id) => document.getElementById(id)?.value || '';
  const isChecked = (id) => document.getElementById(id)?.checked || false;
  const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  
  const model = DOM.modelPath.value;
  if (model) {
    args.push('-m', model);
  }
  
  // 1. Server
  const host = getVal('host');
  if (host) args.push('--host', host);
  const port = getVal('port');
  if (port) args.push('--port', port);
  const alias = getVal('alias');
  if (alias) args.push('--alias', alias);
  const parallel = getNum('parallel');
  if (parallel !== -1 && getVal('parallel') !== '') args.push('-np', parallel.toString());
  const apiKey = getVal('apiKey');
  if (apiKey) args.push('--api-key', apiKey);
  const timeoutVal = getVal('timeout');
  if (timeoutVal !== '') args.push('--timeout', timeoutVal);
  if (isChecked('metrics')) args.push('--metrics');

  // 2. Model & Context
  const contextSize = getNum('contextSize');
  if (contextSize > 0) args.push('-c', contextSize.toString());
  const nPredict = getNum('nPredict');
  if (nPredict !== -1 && getVal('nPredict') !== '') args.push('-n', nPredict.toString());
  if (isChecked('noContextShift')) args.push('--no-context-shift');
  const chatTemplate = getVal('chatTemplate');
  if (chatTemplate) args.push('--chat-template', chatTemplate);
  const chatTemplateKwargs = getVal('chatTemplateKwargs');
  if (chatTemplateKwargs) args.push('--chat-template-kwargs', chatTemplateKwargs); // Node backend wraps with quotes if needed
  if (isChecked('jinja')) args.push('--jinja');
  const mmproj = getVal('mmproj');
  if (mmproj) args.push('--mmproj', mmproj);

  // 3. GPU & Memory
  const gpuLayers = getVal('gpuLayers');
  if (gpuLayers && gpuLayers !== 'auto') args.push('-ngl', gpuLayers);
  const flashAttn = getVal('flashAttn');
  if (flashAttn !== 'auto') args.push('-fa', flashAttn);
  const fit = getVal('fit');
  if (fit !== 'on') args.push('--fit', fit);
  const fitTarget = getNum('fitTarget');
  if (fitTarget !== 1024 && getVal('fitTarget') !== '') args.push('--fit-target', fitTarget.toString());
  const splitMode = getVal('splitMode');
  if (splitMode !== 'layer') args.push('--split-mode', splitMode);
  const tensorSplit = getVal('tensorSplit');
  if (tensorSplit) args.push('--tensor-split', tensorSplit);
  const mainGpu = getNum('mainGpu');
  if (mainGpu !== 0 && getVal('mainGpu') !== '') args.push('--main-gpu', mainGpu.toString());
  const cacheTypeK = getVal('cacheTypeK');
  if (cacheTypeK !== 'f16') args.push('-ctk', cacheTypeK);
  const cacheTypeV = getVal('cacheTypeV');
  if (cacheTypeV !== 'f16') args.push('-ctv', cacheTypeV);
  if (isChecked('cpuMoe')) args.push('--cpu-moe');
  if (isChecked('mlock')) args.push('--mlock');
  const threads = getNum('threads');
  if (threads !== -1 && getVal('threads') !== '') args.push('-t', threads.toString());
  const batchSize = getNum('batchSize');
  if (batchSize !== 2048 && getVal('batchSize') !== '') args.push('-b', batchSize.toString());

  // 4. Sampling
  const temp = getVal('temp');
  if (temp !== '0.8' && temp !== '0.80' && temp !== '') args.push('--temp', temp);
  const topK = getVal('topK');
  if (topK !== '40' && topK !== '') args.push('--top-k', topK);
  const topP = getVal('topP');
  if (topP !== '0.95' && topP !== '') args.push('--top-p', topP);
  const minP = getVal('minP');
  if (minP !== '0.05' && minP !== '') args.push('--min-p', minP);
  const repeatPenalty = getVal('repeatPenalty');
  if (repeatPenalty !== '1' && repeatPenalty !== '1.0' && repeatPenalty !== '1.00' && repeatPenalty !== '') args.push('--repeat-penalty', repeatPenalty);
  const presencePenalty = getVal('presencePenalty');
  if (presencePenalty !== '0' && presencePenalty !== '0.0' && presencePenalty !== '0.00' && presencePenalty !== '') args.push('--presence-penalty', presencePenalty);
  const frequencyPenalty = getVal('frequencyPenalty');
  if (frequencyPenalty !== '0' && frequencyPenalty !== '0.0' && frequencyPenalty !== '0.00' && frequencyPenalty !== '') args.push('--frequency-penalty', frequencyPenalty);
  const seed = getVal('seed');
  if (seed !== '-1' && seed !== '') args.push('--seed', seed);
  const dryMultiplier = getVal('dryMultiplier');
  if (dryMultiplier !== '0' && dryMultiplier !== '0.0' && dryMultiplier !== '0.00' && dryMultiplier !== '') args.push('--dry-multiplier', dryMultiplier);
  const mirostat = getVal('mirostat');
  if (mirostat !== '0') args.push('--mirostat', mirostat);

  // 5. Advanced
  const lora = getVal('lora');
  if (lora) args.push('--lora', lora);
  const ropeScaling = getVal('ropeScaling');
  if (ropeScaling && ropeScaling !== 'none' && ropeScaling !== '') args.push('--rope-scaling', ropeScaling);
  const ropeScale = getVal('ropeScale');
  if (ropeScale) args.push('--rope-scale', ropeScale);
  const rpcServers = getVal('rpcServers');
  if (rpcServers) args.push('--rpc', rpcServers);
  if (isChecked('verbose')) args.push('--verbose');
  const logFile = getVal('logFile');
  if (logFile) args.push('--log-file', logFile);
  
  // Custom args
  const customArgsRaw = getVal('customArgs');
  if (customArgsRaw) {
    const lines = customArgsRaw.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      // Very basic split by space for custom args (assumes no spaces in quoted values)
      // A full shell parser is complex, so we do a simple split or just push the whole line if it's a single token
      const parts = line.split(' ');
      args.push(...parts);
    }
  }

  // Build Display String
  let displayString = (config.llamaServerPath && config.llamaServerPath.trim()) || (DOM.llamaServerPath && DOM.llamaServerPath.value && DOM.llamaServerPath.value.trim()) || 'llama-server.exe';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      displayString += ` \\\n  ${arg}`;
      // Check if next arg is a value
      if (i + 1 < args.length && !args[i+1].startsWith('-')) {
        const val = args[i+1];
        displayString += val.includes(' ') || val.includes('{') ? ` '${val}'` : ` ${val}`;
        i++;
      }
    } else {
      displayString += ` ${arg}`;
    }
  }

  return { argsArray: args, displayString };
}

function updateCommandPreview() {
  const { argsArray, displayString } = buildCommand();
  currentArgsArray = argsArray;
  
  // Syntax highlight
  let highlighted = escapeHtml(displayString);

  // Color the exe path (everything before the first flag continuation)
  const firstFlagIdx = highlighted.indexOf(' \\');
  if (firstFlagIdx !== -1) {
    const exePath = highlighted.slice(0, firstFlagIdx);
    highlighted = `<span style="color: var(--success)">${exePath}</span>${highlighted.slice(firstFlagIdx)}`;
  }
  
  // Color flags (anything starting with - or --)
  highlighted = highlighted.replace(/( -[a-zA-Z0-9-]+)/g, '<span style="color: var(--accent)">$1</span>');
  
  DOM.commandPreview.innerHTML = highlighted;
}

// ---------------------------------------------------------------------------
// SSE Client
// ---------------------------------------------------------------------------

function connectSSE() {
  const eventSource = new EventSource('/api/logs');
  
  eventSource.addEventListener('status', (e) => {
    try {
      const status = JSON.parse(e.data);
      updateStatusUI(status);
    } catch (err) {}
  });

  eventSource.addEventListener('log', (e) => {
    try {
      const entry = JSON.parse(e.data);
      appendLog(entry.type, entry.text, entry.ts);
    } catch (err) {}
  });

  eventSource.onerror = () => {
    eventSource.close();
    // Reconnect after 3s
    setTimeout(connectSSE, 3000);
  };
}

function appendLog(type, text, ts) {
  const el = document.createElement('div');
  el.className = `log-line log-${type}`;
  
  const time = new Date(ts).toLocaleTimeString([], { hour12: false });
  el.innerHTML = `<span class="log-ts">[${time}]</span> ${escapeHtml(text)}`;
  
  DOM.consoleLog.appendChild(el);
  
  // Keep DOM manageable
  if (DOM.consoleLog.children.length > 3000) {
    DOM.consoleLog.removeChild(DOM.consoleLog.firstChild);
  }
  
  if (isAutoScroll) {
    DOM.consoleLog.scrollTop = DOM.consoleLog.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Hardware Optimization Recommendations
// ---------------------------------------------------------------------------

let activeRecommendations = null;

function updateHardwareRecommendations() {
  const modelPath = DOM.modelPath.value;
  if (!modelPath) {
    DOM.hwRecommendationWrapper.classList.add('hidden');
    DOM.hwRecommendationPlaceholder.classList.remove('hidden');
    DOM.hwRecommendationPlaceholder.textContent = 'Select a model to see suggestions...';
    activeRecommendations = null;
    return;
  }

  // Find model size
  let modelSizeGb = 0;
  let modelName = 'Model';
  const modelObj = models.find(m => m.path === modelPath);
  if (modelObj) {
    const rawBytes = modelObj.size || modelObj.sizeBytes || 0;
    modelSizeGb = rawBytes / (1024 * 1024 * 1024);
    modelName = modelObj.name;
  }
  
  if (!modelSizeGb || isNaN(modelSizeGb)) {
    // If entered manually or size missing, guess based on filename
    modelName = modelPath.split(/[/\\]/).pop();
    const nameLower = modelName.toLowerCase();
    if (nameLower.includes('8b')) modelSizeGb = 6.0;
    else if (nameLower.includes('27b') || nameLower.includes('26b')) modelSizeGb = 18.0;
    else if (nameLower.includes('35b')) modelSizeGb = 22.0;
    else if (nameLower.includes('70b')) modelSizeGb = 42.0;
    else if (nameLower.includes('4b')) modelSizeGb = 3.2;
    else if (nameLower.includes('3b')) modelSizeGb = 2.5;
    else modelSizeGb = 8.0;
  }

  const vram = parseFloat(DOM.hwVram.value) || 12;
  const ram = parseFloat(DOM.hwRam.value) || 64;
  const contextSize = parseInt(document.getElementById('contextSize').value) || 0;
  
  // Estimate KV Cache requirements in GB
  const baseCacheSize = 0.5 * (contextSize || 8192) / 1024;
  const scaleFactor = Math.max(1, Math.min(3, modelSizeGb / 8));
  let kvCacheSizeGb = baseCacheSize * scaleFactor;
  
  // Overhead buffer
  const overhead = 1.0; 
  const totalRequired = modelSizeGb + kvCacheSizeGb;

  let advice = '';
  let adviceClass = '';
  let recs = {
    gpuLayers: '0',
    flashAttn: 'on',
    cacheTypeK: 'f16',
    cacheTypeV: 'f16',
    cpuMoe: false,
    mlock: false,
    threads: 8
  };

  const isMoE = modelName.toLowerCase().includes('moe') || modelName.toLowerCase().includes('a3b') || modelName.toLowerCase().includes('a4b');

  if (totalRequired <= vram - overhead) {
    // Fits completely in GPU VRAM
    adviceClass = 'hw-rec-green';
    recs.gpuLayers = 'all';
    recs.flashAttn = 'on';
    recs.cacheTypeK = 'f16';
    recs.cacheTypeV = 'f16';
    recs.mlock = false;
    recs.threads = 4;
    recs.cpuMoe = false;

    advice = `<strong>✨ Perfect Fit!</strong> This model (${modelSizeGb.toFixed(1)} GB) fits entirely in your ${vram}GB GPU VRAM.<br>
    <ul>
      <li>GPU Layers: Offload all (ngl = <strong>all</strong>)</li>
      <li>Cache Format: High Quality (<strong>f16</strong>)</li>
      <li>Threads: <strong>4</strong> (GPU heavy)</li>
      <li>Expected Speed: <strong>Very Fast</strong> (50+ tok/s)</li>
    </ul>`;
  } else if (modelSizeGb < vram + ram - overhead) {
    // Splits between GPU VRAM and System RAM
    adviceClass = 'hw-rec-blue';
    
    // We want to leave some room in VRAM for the KV cache and overhead
    const availableForModel = vram - kvCacheSizeGb - overhead;
    let fractionToOffload = 0;
    if (availableForModel > 0) {
      fractionToOffload = availableForModel / modelSizeGb;
    }
    
    // Suggest KV cache compression if VRAM is tight
    if (fractionToOffload < 0.3) {
      recs.cacheTypeK = 'q4_0';
      recs.cacheTypeV = 'q4_0';
      kvCacheSizeGb = kvCacheSizeGb * 0.3;
      const newAvailable = vram - kvCacheSizeGb - overhead;
      fractionToOffload = Math.max(0, newAvailable / modelSizeGb);
    } else if (fractionToOffload < 0.6) {
      recs.cacheTypeK = 'q8_0';
      recs.cacheTypeV = 'q8_0';
      kvCacheSizeGb = kvCacheSizeGb * 0.55;
      const newAvailable = vram - kvCacheSizeGb - overhead;
      fractionToOffload = Math.max(0, newAvailable / modelSizeGb);
    } else {
      recs.cacheTypeK = 'f16';
      recs.cacheTypeV = 'f16';
    }

    // Estimate number of layers based on model sizes
    let totalLayers = 32;
    if (modelSizeGb > 30) totalLayers = 80;
    else if (modelSizeGb > 20) totalLayers = 60;
    else if (modelSizeGb > 10) totalLayers = 48;

    const layersToOffload = Math.max(1, Math.min(totalLayers - 1, Math.round(totalLayers * fractionToOffload)));
    
    recs.gpuLayers = layersToOffload.toString();
    recs.flashAttn = 'on';
    recs.mlock = true;
    recs.threads = 8;
    recs.cpuMoe = isMoE;

    advice = `<strong>⚡ Split Mode:</strong> Model exceeds VRAM but fits in RAM. Workload will be divided.<br>
    <ul>
      <li>GPU Layers: Offload <strong>${layersToOffload} / ${totalLayers}</strong> layers</li>
      <li>Cache Format: <strong>${recs.cacheTypeK}</strong> (conserves VRAM)</li>
      <li>mlock: <strong>Enabled</strong> (prevents slow swap files)</li>
      <li>Threads: <strong>8</strong> (optimized for CPU processing)</li>
      ${isMoE ? '<li>CPU MoE: <strong>Enabled</strong> (reduces VRAM requirements)</li>' : ''}
      <li>Expected Speed: <strong>Moderate</strong> (10-25 tok/s)</li>
    </ul>`;
  } else {
    // Out of memory
    adviceClass = 'hw-rec-warning';
    recs.gpuLayers = '0';
    recs.flashAttn = 'on';
    recs.cacheTypeK = 'q4_0';
    recs.cacheTypeV = 'q4_0';
    recs.mlock = true;
    recs.threads = 8;
    recs.cpuMoe = isMoE;

    advice = `<strong>⚠️ Low Memory Warning:</strong> Model (${modelSizeGb.toFixed(1)} GB) exceeds your combined VRAM + RAM (${(vram+ram).toFixed(0)} GB).<br>
    <ul>
      <li>Recommendation: Use a smaller model or lower quantization format (e.g. Q4_K_M).</li>
      <li>Running this will trigger heavy disk paging, causing severe lag (less than 1 tok/s) or a crash.</li>
    </ul>`;
  }

  DOM.hwRecommendationPlaceholder.classList.add('hidden');
  DOM.hwRecommendationWrapper.classList.remove('hidden');
  DOM.hwRecommendationWrapper.className = `hw-recommendation-wrapper ${adviceClass}`;
  DOM.hwRecommendationText.innerHTML = advice;
  activeRecommendations = recs;
}

function applyHardwareOptimizations() {
  if (!activeRecommendations) return;

  const rec = activeRecommendations;

  // Apply to form controls
  document.getElementById('gpuLayers').value = rec.gpuLayers;
  document.getElementById('flashAttn').value = rec.flashAttn;
  document.getElementById('cacheTypeK').value = rec.cacheTypeK;
  document.getElementById('cacheTypeV').value = rec.cacheTypeV;
  document.getElementById('mlock').checked = rec.mlock;
  document.getElementById('threads').value = rec.threads;
  
  const cpuMoeEl = document.getElementById('cpuMoe');
  if (cpuMoeEl) cpuMoeEl.checked = rec.cpuMoe;

  updateCommandPreview();
  showToast('Applied recommended hardware optimization settings!', 'success');
}

// ---------------------------------------------------------------------------
// Chat Logic & Helpers (Iframe Mirroring)
// ---------------------------------------------------------------------------

let currentIframeUrl = '';

function updateChatUIState(isRunning, statusPort) {
  const host = document.getElementById('host')?.value || '127.0.0.1';
  const port = statusPort || document.getElementById('port')?.value || 8085;
  const cleanHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const targetUrl = `http://${cleanHost}:${port}/`;

  if (isRunning) {
    if (currentIframeUrl !== targetUrl) {
      currentIframeUrl = targetUrl;
      if (DOM.chatIframeContainer) {
        DOM.chatIframeContainer.innerHTML = `<iframe src="${targetUrl}" style="width: 100%; height: 100%; border: none;"></iframe>`;
      }
    }
  } else {
    if (currentIframeUrl !== '') {
      currentIframeUrl = '';
      if (DOM.chatIframeContainer) {
        DOM.chatIframeContainer.innerHTML = `
          <div class="chat-welcome">
            <span class="welcome-icon">💬</span>
            <h3>Llama Server UI</h3>
            <p id="chatIframeStatus">Start the server using the sidebar button to mirror the interface here.</p>
          </div>
        `;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Link Processor Frontend Logic
// ---------------------------------------------------------------------------

function initLinkProcessor() {
  const lpConfigForm = document.getElementById('lp-config-form');
  if (lpConfigForm) {
    lpConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputFile = document.getElementById('lp-input-file').value.trim();
      const journalsDir = document.getElementById('lp-journals-dir').value.trim();
      const debounceMs = document.getElementById('lp-debounce-ms').value;

      try {
        const res = await fetch('/api/link-processor/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputFile, journalsDir, debounceMs })
        });
        if (res.ok) {
          showToast('Link processor configuration saved!', 'success');
          refreshLpData();
        } else {
          showToast('Failed to save configuration', 'error');
        }
      } catch (err) {
        showToast('Error saving configuration', 'error');
      }
    });
  }

  const btnProcess1 = document.getElementById('lp-btn-process-1');
  const btnProcess10 = document.getElementById('lp-btn-process-10');
  const btnProcessAll = document.getElementById('lp-btn-process-all');

  if (btnProcess1) btnProcess1.addEventListener('click', () => triggerLpProcess(1));
  if (btnProcess10) btnProcess10.addEventListener('click', () => triggerLpProcess(10));
  if (btnProcessAll) btnProcessAll.addEventListener('click', () => triggerLpProcess(null));

  // Browse for the Obsidian Links.md file
  if (DOM.lpBtnBrowseInputFile) {
    DOM.lpBtnBrowseInputFile.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/browse-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: 'Markdown files (*.md)|*.md|All files (*.*)|*.*',
            title: 'Select Obsidian Links file'
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to browse for file');
        }
        const data = await res.json();
        if (data && data.path) {
          document.getElementById('lp-input-file').value = data.path;
        }
      } catch (err) {
        showToast(err.message || 'Failed to browse for file', 'danger');
      }
    });
  }

  // Browse for the Logseq journals directory
  if (DOM.lpBtnBrowseJournalsDir) {
    DOM.lpBtnBrowseJournalsDir.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/browse-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'Select Logseq Journals Directory' })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to browse for folder');
        }
        const data = await res.json();
        if (data && data.path) {
          document.getElementById('lp-journals-dir').value = data.path;
        }
      } catch (err) {
        showToast(err.message || 'Failed to browse for folder', 'danger');
      }
    });
  }

  // Category tags: add new tag
  if (DOM.lpBtnCategoryAdd) {
    DOM.lpBtnCategoryAdd.addEventListener('click', async () => {
      const input = DOM.lpCategoryNew;
      const name = input.value.trim().replace(/^#/, '');
      if (!name) {
        showToast('Enter a tag name first', 'info');
        return;
      }
      if (lpCategories[name]) {
        showToast(`Tag #${name} already exists`, 'info');
        return;
      }
      lpCategories[name] = [];
      try {
        await saveLpCategories(lpCategories);
        renderLpCategories(lpCategories);
        input.value = '';
        showToast(`Tag #${name} added`, 'success');
      } catch (err) {
        delete lpCategories[name];
        showToast('Failed to add tag', 'error');
      }
    });
    DOM.lpCategoryNew.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        DOM.lpBtnCategoryAdd.click();
      }
    });
  }

  // Category tags: edit / delete via event delegation
  const catGrid = document.getElementById('lp-categories-grid');
  if (catGrid) {
    catGrid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.lp-cat-btn');
      if (!btn) return;
      const pill = btn.closest('.lp-category-pill');
      if (!pill) return;
      const tag = pill.dataset.tag;
      const editor = pill.querySelector('.lp-category-editor');

      if (btn.classList.contains('lp-cat-del')) {
        if (!lpCategories[tag]) return;
        delete lpCategories[tag];
        try {
          await saveLpCategories(lpCategories);
          renderLpCategories(lpCategories);
          showToast(`Tag #${tag} deleted`, 'success');
        } catch (err) {
          showToast('Failed to delete tag', 'error');
        }
      } else if (btn.classList.contains('lp-cat-edit')) {
        if (editor) editor.classList.toggle('hidden');
      } else if (btn.classList.contains('lp-cat-save')) {
        const textEl = pill.querySelector('.lp-cat-keywords');
        if (!textEl) return;
        const keywords = textEl.value.split(',').map(s => s.trim()).filter(Boolean);
        lpCategories[tag] = keywords;
        try {
          await saveLpCategories(lpCategories);
          renderLpCategories(lpCategories);
          showToast(`Tag #${tag} updated`, 'success');
        } catch (err) {
          showToast('Failed to update tag', 'error');
        }
      } else if (btn.classList.contains('lp-cat-cancel')) {
        if (editor) editor.classList.add('hidden');
      }
    });
  }

  // Git sync
  initGitSync();

  // Set up periodic refresh
  pollLpStatus();
  refreshLpData();
  setInterval(pollLpStatus, 3000);
  setInterval(refreshLpData, 10000);
}

function initGitSync() {
  if (!DOM.lpGitEnabled) return;

  async function saveGitRepoPath(newPath) {
    try {
      const res = await fetch('/api/link-processor/git/config');
      const current = res.ok ? await res.json() : {};
      const trimmed = (newPath || '').trim();
      const saveRes = await fetch('/api/link-processor/git/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current, repoPath: trimmed || null })
      });
      if (saveRes.ok) {
        showToast(trimmed ? 'Git repository folder updated' : 'Reset Git repo folder to default Links file directory', 'success');
        refreshGitStatus();
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save Git repository path');
      }
    } catch (err) {
      console.error('Error saving Git repository path:', err);
      showToast(err.message || 'Failed to save Git repository path', 'error');
    }
  }

  if (DOM.lpBtnBrowseGitRepo) {
    DOM.lpBtnBrowseGitRepo.addEventListener('click', async () => {
      try {
        DOM.lpBtnBrowseGitRepo.disabled = true;
        DOM.lpBtnBrowseGitRepo.textContent = '⏳';
        const currentVal = DOM.lpGitRepoInput?.value?.trim() || '';
        const res = await fetch('/api/browse-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: 'Select Obsidian Vault Folder (.git)',
            initialDir: currentVal
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to browse for folder');
        }
        const data = await res.json();
        if (data && data.path) {
          if (DOM.lpGitRepoInput) {
            DOM.lpGitRepoInput.value = data.path;
          }
          await saveGitRepoPath(data.path);
        }
      } catch (err) {
        showToast(err.message || 'Failed to browse for folder', 'danger');
      } finally {
        DOM.lpBtnBrowseGitRepo.disabled = false;
        DOM.lpBtnBrowseGitRepo.textContent = '📁';
      }
    });
  }

  if (DOM.lpBtnSaveGitRepo && DOM.lpGitRepoInput) {
    DOM.lpBtnSaveGitRepo.addEventListener('click', () => {
      saveGitRepoPath(DOM.lpGitRepoInput.value);
    });
    DOM.lpGitRepoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveGitRepoPath(DOM.lpGitRepoInput.value);
      }
    });
  }

  DOM.lpGitEnabled.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      const res = await fetch('/api/link-processor/git/config');
      const current = res.ok ? await res.json() : {};
      const saveRes = await fetch('/api/link-processor/git/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current, enabled })
      });
      if (saveRes.ok) {
        showToast(enabled ? 'Git sync enabled' : 'Git sync disabled', enabled ? 'success' : 'info');
        refreshGitStatus();
      } else {
        throw new Error('Failed to save Git config');
      }
    } catch (err) {
      console.error('Error toggling Git sync:', err);
      showToast('Failed to toggle Git sync', 'error');
      e.target.checked = !enabled;
    }
  });

  if (DOM.lpGitBtnSync) {
    DOM.lpGitBtnSync.addEventListener('click', async () => {
      DOM.lpGitBtnSync.disabled = true;
      DOM.lpGitBtnSync.textContent = 'Syncing...';
      try {
        const res = await fetch('/api/link-processor/git/sync', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.result?.skipped ? 'Git sync is disabled' : 'Git sync complete', 'success');
        } else {
          showToast(data.result?.error || 'Git sync failed', 'error');
        }
        refreshGitStatus();
      } catch (err) {
        console.error('Error triggering Git sync:', err);
        showToast('Failed to trigger Git sync', 'error');
      } finally {
        DOM.lpGitBtnSync.disabled = false;
        DOM.lpGitBtnSync.textContent = '🔄 Sync Now';
      }
    });
  }

  refreshGitStatus();
  setInterval(refreshGitStatus, 5000);
}

async function refreshGitStatus() {
  if (!DOM.lpGitEnabled) return;

  try {
    const [configRes, statusRes] = await Promise.all([
      fetch('/api/link-processor/git/config'),
      fetch('/api/link-processor/git/status')
    ]);

    const gitConfig = configRes.ok ? await configRes.json() : { enabled: false };
    const gitStatus = statusRes.ok ? await statusRes.json() : { enabled: false };

    DOM.lpGitEnabled.checked = gitConfig.enabled === true;

    // Update repository path input if not currently focused by user
    if (DOM.lpGitRepoInput && document.activeElement !== DOM.lpGitRepoInput) {
      DOM.lpGitRepoInput.value = gitConfig.repoPath || '';
    }

    const isEnabled = gitConfig.enabled === true;
    const card = DOM.lpGitCard;
    if (card) {
      card.classList.toggle('lp-git-active', isEnabled);
    }

    if (!isEnabled) {
      setGitStatusText('Disabled', 'muted');
      if (DOM.lpGitHint) {
        DOM.lpGitHint.textContent = 'Git sync is disabled. Enable it to automatically pull, commit and push your Obsidian vault.';
        DOM.lpGitHint.classList.remove('hidden');
      }
      DOM.lpGitRepoPath.textContent = gitConfig.repoPath || '—';
      DOM.lpGitBranch.textContent = '—';
      DOM.lpGitRemote.textContent = '—';
      DOM.lpGitChanges.textContent = '—';
      DOM.lpGitChangesRow.classList.add('hidden');
      DOM.lpGitAheadBehind.textContent = '—';
      DOM.lpGitAheadRow.classList.add('hidden');
      return;
    }

    if (DOM.lpGitHint) DOM.lpGitHint.classList.add('hidden');

    if (!gitStatus.isRepo) {
      setGitStatusText(gitStatus.error ? `Error: ${gitStatus.error}` : 'Not a Git repository', 'error');
      DOM.lpGitRepoPath.textContent = gitStatus.repoPath || gitConfig.repoPath || '—';
      DOM.lpGitBranch.textContent = '—';
      DOM.lpGitRemote.textContent = '—';
      DOM.lpGitChanges.textContent = '—';
      DOM.lpGitChangesRow.classList.add('hidden');
      DOM.lpGitAheadBehind.textContent = '—';
      DOM.lpGitAheadRow.classList.add('hidden');
      return;
    }

    DOM.lpGitRepoPath.textContent = gitStatus.repoPath || gitConfig.repoPath || '—';
    DOM.lpGitBranch.textContent = gitStatus.branch || '—';
    DOM.lpGitRemote.textContent = gitStatus.remote || '—';

    DOM.lpGitChanges.textContent = gitStatus.hasChanges ? 'Yes' : 'None';
    DOM.lpGitChangesRow.classList.remove('hidden');
    DOM.lpGitAheadBehind.textContent = `${gitStatus.ahead || 0} / ${gitStatus.behind || 0}`;
    DOM.lpGitAheadRow.classList.remove('hidden');

    if (gitStatus.hasChanges) {
      setGitStatusText('Uncommitted changes', 'warning');
    } else if ((gitStatus.ahead || 0) > 0) {
      setGitStatusText('Unpushed commits', 'warning');
    } else if ((gitStatus.behind || 0) > 0) {
      setGitStatusText('Behind remote', 'warning');
    } else {
      setGitStatusText('Up to date', 'success');
    }
  } catch (err) {
    console.error('Error refreshing Git status:', err);
    setGitStatusText('Unavailable', 'error');
  }
}

function setGitStatusText(text, type) {
  if (!DOM.lpGitStatusText) return;
  DOM.lpGitStatusText.textContent = text;
  DOM.lpGitStatusText.className = 'lp-git-status-value lp-git-status-' + type;
}

async function pollLpStatus() {
  try {
    const res = await fetch('/api/link-processor/status');
    if (res.ok) {
      const status = await res.json();
      updateLpStatusUI(status);
    }
  } catch (err) {
    // Ignore
  }
}

function updateLpStatusUI(status) {
  const watcherBadge = document.getElementById('lp-watcher-badge');
  const llmBadge = document.getElementById('lp-llm-badge');
  
  if (watcherBadge) {
    watcherBadge.className = 'status-badge';
    if (status.isProcessing) {
      watcherBadge.classList.add('busy');
      watcherBadge.querySelector('.label').textContent = 'Watcher: Processing...';
    } else if (status.watcherActive) {
      watcherBadge.classList.add('online');
      watcherBadge.querySelector('.label').textContent = 'Watcher: Active';
    } else {
      watcherBadge.classList.add('offline');
      watcherBadge.querySelector('.label').textContent = 'Watcher: Off';
    }
  }
  
  if (llmBadge) {
    llmBadge.className = 'status-badge';
    if (status.llmOnline) {
      llmBadge.classList.add('online');
      llmBadge.querySelector('.label').textContent = 'AI Model: Online';
    } else {
      llmBadge.classList.add('offline');
      llmBadge.querySelector('.label').textContent = 'AI Model: Offline';
    }
  }
}

async function saveLpCategories(categories) {
  const res = await fetch('/api/link-processor/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save categories');
  }
  return res.json();
}

function renderLpCategories(categories) {
  const catGrid = document.getElementById('lp-categories-grid');
  const catCount = document.getElementById('lp-categories-count');
  if (!catGrid || !catCount) return;

  catGrid.innerHTML = '';
  const tags = Object.keys(categories);
  catCount.textContent = `${tags.length} tag${tags.length === 1 ? '' : 's'}`;

  tags.forEach(tag => {
    const keywords = Array.isArray(categories[tag]) ? categories[tag] : [];
    const pill = document.createElement('div');
    pill.className = 'lp-category-pill';
    pill.dataset.tag = tag;
    pill.innerHTML = `
      <div class="lp-category-pill-header">
        <span class="lp-category-tag">#${escapeHtml(tag)}</span>
        <span class="lp-category-actions">
          <button type="button" class="lp-cat-btn lp-cat-edit" title="Edit keywords">✏️</button>
          <button type="button" class="lp-cat-btn lp-cat-del" title="Delete tag">✕</button>
        </span>
      </div>
      <span class="lp-category-count">${keywords.length} keyword${keywords.length === 1 ? '' : 's'}</span>
      <div class="lp-category-editor hidden">
        <textarea class="lp-cat-keywords" rows="2" placeholder="keyword1, keyword2" spellcheck="false">${escapeHtml(keywords.join(', '))}</textarea>
        <div class="lp-category-editor-actions">
          <button type="button" class="lp-cat-btn lp-cat-save">Save</button>
          <button type="button" class="lp-cat-btn lp-cat-cancel">Cancel</button>
        </div>
      </div>
    `;
    pill.title = keywords.join(', ');
    catGrid.appendChild(pill);
  });
}

async function refreshLpData() {
  // 1. Fetch config values to populate form
  try {
    const res = await fetch('/api/link-processor/config');
    if (res.ok) {
      const lpConfig = await res.json();
      
      const inputFileEl = document.getElementById('lp-input-file');
      const journalsDirEl = document.getElementById('lp-journals-dir');
      const debounceMsEl = document.getElementById('lp-debounce-ms');
      
      if (inputFileEl) inputFileEl.value = lpConfig.inputFile || '';
      if (journalsDirEl) journalsDirEl.value = lpConfig.journalsDir || '';
      if (debounceMsEl) debounceMsEl.value = lpConfig.debounceMs || 2000;

      // Render categories grid
      lpCategories = lpConfig.categories || {};
      renderLpCategories(lpCategories);
    }
  } catch (err) {
    console.error('Error fetching LP config:', err);
  }
  
  // 2. Fetch pending queue
  try {
    const res = await fetch('/api/link-processor/queue');
    if (res.ok) {
      const data = await res.json();
      const queueList = document.getElementById('lp-queue-list');
      const queueCount = document.getElementById('lp-queue-count');
      if (queueList && queueCount) {
        queueList.innerHTML = '';
        
        const queue = data.queue || [];
        queueCount.textContent = `${queue.length} link${queue.length === 1 ? '' : 's'}`;
        
        if (queue.length === 0) {
          queueList.innerHTML = '<li class="lp-empty">No links waiting in Links.md. Add some URLs to start!</li>';
        } else {
          queue.forEach(item => {
            const li = document.createElement('li');
            const displayTitle = item.providedTitle || item.url;
            const displayDesc = item.providedInfo || (item.isMarkdownLink ? 'Markdown Link' : 'Bare URL');
            li.innerHTML = `
              <div class="lp-item-title">${escapeHtml(displayTitle)}</div>
              <div class="lp-item-desc">${escapeHtml(displayDesc)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(item.url)}</div>
            `;
            queueList.appendChild(li);
          });
        }
      }
    }
  } catch (err) {
    console.error('Error fetching LP queue:', err);
  }
  
  // 3. Fetch history
  try {
    const res = await fetch('/api/link-processor/history');
    if (res.ok) {
      const data = await res.json();
      const historyList = document.getElementById('lp-history-list');
      const historyCount = document.getElementById('lp-history-count');
      if (historyList && historyCount) {
        historyList.innerHTML = '';
        
        const history = data.history || [];
        historyCount.textContent = `${history.length} item${history.length === 1 ? '' : 's'}`;
        
        if (history.length === 0) {
          historyList.innerHTML = '<li class="lp-empty">No processed URLs found in history.</li>';
        } else {
          history.forEach(entry => {
            const li = document.createElement('li');
            const url = entry.url || entry; // Support both {url, timestamp} and string
            const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : null;
            li.innerHTML = `
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">${ts ? escapeHtml(ts) : ''}</div>
              <div style="word-break: break-all;">${escapeHtml(url)}</div>
            `;
            historyList.appendChild(li);
          });
        }
      }
    }
  } catch (err) {
    console.error('Error fetching LP history:', err);
  }
}

async function triggerLpProcess(limit) {
  try {
    const res = await fetch('/api/link-processor/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit })
    });
    if (res.ok) {
      showToast('Link processing started in background!', 'success');
      setTimeout(refreshLpData, 1000);
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Failed to trigger processing', 'error');
    }
  } catch (err) {
    showToast('Error triggering processing', 'error');
  }
}

// ---------- Settings Search & Param Tag Overlay ----------
function initSettingsSearch() {
  const searchInput = document.getElementById('settingsSearch');
  const searchClear = document.getElementById('settingsSearchClear');
  const resultsEl = document.getElementById('settingsSearchResults');
  if (!searchInput || !resultsEl) return;

  const tabNames = {};
  document.querySelectorAll('.tab').forEach(btn => {
    tabNames[btn.getAttribute('aria-controls')] = btn.textContent.trim();
  });

  let currentIndex = 0;
  let allResults = [];

  function buildSettingRegistry() {
    const registry = [];
    document.querySelectorAll('.form-group').forEach(group => {
      const panel = group.closest('.tab-panel');
      if (!panel) return;
      const tabId = panel.id;
      const tabName = tabNames[tabId] || tabId;

      let label = group.querySelector('.toggle-label-group > label, :scope > label');
      let input = group.querySelector('input, select, textarea');
      if (!label || !input) return;

      const tag = label.getAttribute('title') || '';
      const name = label.childNodes[0]?.textContent.trim() || label.textContent.trim();

      registry.push({ name, tag, tabName, input, label });
    });
    return registry;
  }

  function appendParamTags() {
    document.querySelectorAll('.form-group').forEach(group => {
      const label = group.querySelector('label');
      if (!label) return;
      const tag = label.getAttribute('title');
      if (!tag || label.querySelector('.param-tag')) return;
      const tagSpan = document.createElement('span');
      tagSpan.className = 'param-tag';
      tagSpan.textContent = `(-${tag.replace(/^--/, '').replace(/^-/, '')})`;
      tagSpan.setAttribute('title', `Flag: ${tag.startsWith('-') ? tag : '-' + tag}`);
      label.appendChild(tagSpan);
    });
  }

  function clearHighlights() {
    document.querySelectorAll('.setting-highlight').forEach(el => {
      el.classList.remove('setting-highlight');
    });
  }

  function activateTabFor(panel) {
    const tabBtn = document.querySelector(`.tab[aria-controls="${panel.id}"]`);
    if (tabBtn) {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active', 'glow'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tabBtn.classList.add('active');
      panel.classList.add('active');
    }
  }

  function jumpToSetting(entry, highlight = true) {
    clearHighlights();
    const panel = entry.input.closest('.tab-panel');
    if (panel) activateTabFor(panel);

    entry.input.closest('.form-group').scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (highlight) {
      const group = entry.input.closest('.form-group');
      group.classList.remove('setting-highlight');
      void group.offsetWidth;
      group.classList.add('setting-highlight');
    }

    if (entry.input instanceof HTMLInputElement || entry.input instanceof HTMLTextAreaElement) {
      entry.input.focus({ preventScroll: true });
      entry.input.select();
    }
  }

  function renderResults() {
    resultsEl.innerHTML = '';
    if (!allResults.length) {
      resultsEl.innerHTML = '<div class="settings-search-empty">No settings found</div>';
      resultsEl.classList.add('open');
      return;
    }
    allResults.forEach((entry, i) => {
      const item = document.createElement('div');
      item.className = 'settings-search-result-item';
      if (i === currentIndex) item.style.background = 'var(--bg-hover)';
      item.innerHTML = `
        <span class="result-name">${entry.name}</span>
        <span class="result-tab">${entry.tabName}</span>
        <span class="result-tag">${entry.tag || ''}</span>
      `;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        jumpToSetting(entry);
        resultsEl.classList.remove('open');
      });
      resultsEl.appendChild(item);
    });
  }

  function runSearch(query) {
    clearHighlights();
    query = query.trim().toLowerCase();
    if (!query) {
      allResults = [];
      resultsEl.classList.remove('open');
      searchClear.style.display = 'none';
      return;
    }
    searchClear.style.display = 'block';

    const registry = buildSettingRegistry();
    allResults = registry.filter(e =>
      e.name.toLowerCase().includes(query) ||
      (e.tag && e.tag.toLowerCase().includes(query))
    );
    currentIndex = 0;
    renderResults();
  }

  searchInput.addEventListener('input', () => runSearch(searchInput.value));
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderResults(); });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && allResults.length) {
      e.preventDefault();
      currentIndex = (currentIndex + 1) % allResults.length;
      renderResults();
    } else if (e.key === 'ArrowUp' && allResults.length) {
      e.preventDefault();
      currentIndex = (currentIndex - 1 + allResults.length) % allResults.length;
      renderResults();
    } else if (e.key === 'Enter' && allResults.length) {
      e.preventDefault();
      const entry = allResults[currentIndex];
      jumpToSetting(entry);
      resultsEl.classList.remove('open');
    } else if (e.key === 'Escape') {
      resultsEl.classList.remove('open');
      searchClear.style.display = 'none';
      searchInput.value = '';
      clearHighlights();
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    resultsEl.classList.remove('open');
    clearHighlights();
    searchInput.focus();
  });

  document.addEventListener('click', (e) => {
    if (!resultsEl.classList.contains('open')) return;
    if (!searchInput.closest('.settings-search').contains(e.target)) {
      resultsEl.classList.remove('open');
    }
  });

  appendParamTags();
}

// Start
document.addEventListener('DOMContentLoaded', () => {
  initSettingsSearch();
  init();
});
