const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const isPackaged = process.pkg !== undefined;

const DEFAULT_CATEGORIES = {
  SUC: ["legislation", "directivă", "lege", "laws", "european law", "romanian law", "parlament", "deputați", "senat"],
  homelab: ["homelab", "home lab", "proxmox", "unraid", "truenas"],
  selfHosted: ["self-hosted", "selfhosted", "docker", "portainer"],
  homeAssistant: ["home assistant", "homeassistant", "hass.io", "esphome", "zigbee"],
  mdlw: ["electronics", "raspberry pi", "raspberrypi", "esp32", "esp8266", "arduino", "microcontroller"],
  glassJob: ["glass", "sticlă", "fereastră", "geam", "feronerie"],
  localLLM: ["local llm", "llama.cpp", "ollama", "local ai", "huggingface"],
  healthcare: ["healthcare", "health", "medical", "sănătate", "medic", "doctor"]
};

// Check for categories.json in process.cwd() first, falling back to bundle PROJECT_ROOT
const localCategoriesPath = path.join(process.cwd(), 'categories.json');
const defaultCategoriesPath = path.join(PROJECT_ROOT, 'categories.json');

let categoriesPath = process.env.CATEGORIES_FILE || (fs.existsSync(localCategoriesPath)
  ? localCategoriesPath
  : defaultCategoriesPath);

// Auto-initialize categories file if custom environment variable path is set but doesn't exist
if (process.env.CATEGORIES_FILE && !fs.existsSync(process.env.CATEGORIES_FILE)) {
  try {
    const src = fs.existsSync(localCategoriesPath) ? localCategoriesPath : defaultCategoriesPath;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, process.env.CATEGORIES_FILE);
      categoriesPath = process.env.CATEGORIES_FILE;
    }
  } catch (err) {
    console.warn(`  ⚠️ Failed to initialize categories file at ${process.env.CATEGORIES_FILE}: ${err.message}`);
  }
}

let categories = DEFAULT_CATEGORIES;
if (fs.existsSync(categoriesPath)) {
  try {
    categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
  } catch (err) {
    console.warn(`  ⚠️ Failed to parse categories file: ${err.message}. Using defaults.`);
  }
}

const runtimeConfig = {
  inputFile: process.env.LINK_INPUT_FILE || path.join(PROJECT_ROOT, 'obsidian', 'Links.md'),
  journalsDir: process.env.LINK_JOURNALS_DIR || path.join(PROJECT_ROOT, 'obsidian', 'journals'),
  historyFile: process.env.HISTORY_FILE || (isPackaged
    ? path.join(process.cwd(), 'processed_history.json')
    : path.join(PROJECT_ROOT, 'processed_history.json')),
  scraperTimeout: 10000,
  llmTimeout: 60000,
  llmCheckIntervalMs: 30000,
  debounceMs: 2000,
  categories,
  git: {
    enabled: false,
    // Path to the Obsidian vault / git repository. Defaults to dirname(inputFile).
    repoPath: null,
    // Pull on startup and then periodically; set to false to disable pulls.
    autoPull: true,
    // Commit local changes automatically after processing.
    autoCommit: true,
    // Push commits automatically after a debounce delay.
    autoPush: true,
    pullIntervalMinutes: 5,
    pushDebounceMs: 30000,
    remoteName: 'origin',
    branch: null,
    name: 'Link Processor',
    email: 'link-processor@local',
    commitMessageTemplate: 'Auto-sync: {count} file(s) changed on {date}'
  },
  getJournalFilename(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}_${mm}_${dd}.md`;
  }
};

function updateRuntimeConfig(newConfig) {
  if (!newConfig) return;
  // Prioritize environment variables over configuration file values
  if (newConfig.inputFile && !process.env.LINK_INPUT_FILE) {
    runtimeConfig.inputFile = newConfig.inputFile;
  }
  if (newConfig.journalsDir && !process.env.LINK_JOURNALS_DIR) {
    runtimeConfig.journalsDir = newConfig.journalsDir;
  }
  if (newConfig.debounceMs) {
    runtimeConfig.debounceMs = parseInt(newConfig.debounceMs, 10) || 2000;
  }
  if (newConfig.categories && typeof newConfig.categories === 'object' && !Array.isArray(newConfig.categories)) {
    runtimeConfig.categories = newConfig.categories;
  }
  if (newConfig.git) {
    runtimeConfig.git = {
      ...runtimeConfig.git,
      ...newConfig.git
    };
  }
}

/**
 * Persist the category tags to the categories file (categories.json).
 * @param {object} newCategories  Map of tag name -> keyword array
 * @returns {string} Path the categories were written to
 */
function saveCategories(newCategories) {
  const sanitized = {};
  for (const [key, keywords] of Object.entries(newCategories || {})) {
    if (!key || typeof key !== 'string') continue;
    sanitized[key] = Array.isArray(keywords)
      ? keywords.map(k => String(k).trim()).filter(Boolean)
      : [];
  }
  fs.writeFileSync(categoriesPath, JSON.stringify(sanitized, null, 2), 'utf-8');
  return categoriesPath;
}

module.exports = {
  config: runtimeConfig,
  updateRuntimeConfig,
  saveCategories,
  categoriesPath
};
