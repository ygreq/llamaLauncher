const chokidar = require('chokidar');
const fs = require('fs');
const { config, updateRuntimeConfig } = require('./config');
const history = require('./history');
const { parseLinksFile } = require('./parser');
const { scrapeUrl } = require('./scraper');
const { formatBlock, formatBlocks } = require('./formatter');
const { appendToJournal, cleanLinksFile, appendToUnprocessed } = require('./writer');
const { setLlmPortCallback, isLlmAvailable, llmProcess } = require('./llm');
const git = require('./git');

let isProcessing = false;
let isPaused = false;
let debounceTimer = null;
let watcher = null;
let periodicInterval = null;
let pushLogCallback = console.log;

const REDIRECT_PATTERNS = [
  /bit\.ly/i, /tinyurl\.com/i, /t\.co/i, /goo\.gl/i, /ow\.ly/i, /is\.gd/i,
  /buff\.ly/i, /adf\.ly/i, /bit\.do/i, /mcaf\.ee/i, /su\.pr/i, /lnk\.to/i,
  /t\.me/i, /qr\.ae/i, /tiny\.cc/i, /share\.google/i,
  /\/(url|share|goto|redirect|link|ref)/i,
  /[/?&](url|q|redirect|target|to|link|goto|ref)=/i
];

function isRedirector(url) {
  return REDIRECT_PATTERNS.some(pattern => pattern.test(url));
}

// Social platforms whose posts may embed other web links (x.com, Facebook, etc.)
const SOCIAL_HOSTS = new Set([
  'x.com', 'twitter.com', 'facebook.com', 'fb.com', 'm.facebook.com',
  'instagram.com', 'tiktok.com', 'linkedin.com', 'threads.net',
  'reddit.com', 't.me'
]);

function getHostname(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isSocialMedia(url) {
  return SOCIAL_HOSTS.has(getHostname(url));
}

/**
 * Extract external web links embedded in a social media post's scraped content.
 * Skips links that point back to the post's own platform.
 * @param {object} meta        Result from scrapeUrl
 * @param {string} originalUrl The social post URL being processed
 * @returns {string[]}
 */
function extractEmbeddedLinks(meta, originalUrl) {
  const sources = [
    meta?.description,
    ...(Array.isArray(meta?.articleContent) ? meta.articleContent : [])
  ].filter(Boolean);

  const originalHost = getHostname(originalUrl);
  const found = new Set();

  for (const text of sources) {
    const matches = text.match(/https?:\/\/[^\s<>"')\]}]+/g) || [];
    for (const raw of matches) {
      const cleaned = raw.replace(/[.,;:!?]+$/, '');
      const host = getHostname(cleaned);
      if (!host) continue;
      if (host === originalHost) continue;
      found.add(cleaned);
    }
  }

  return Array.from(found);
}

function cleanUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    
    // Strict whitelist of allowed query parameters. All other parameters (e.g. tracking, error codes) will be stripped.
    const ALLOWED_PARAMS = new Set([
      'v', 't', 'list', 'index', 'time_continue', 'feature', // Video playback
      'q', 'query', 'search', 's',                           // Search queries
      'id', 'pid', 'p', 'post', 'article',                   // Item identifiers
      'page', 'tab', 'category',                             // Navigation/Pagination
      'lang', 'locale',                                      // Localization
      'w', 'h', 'width', 'height', 'format', 'type'          // Media & Formats
    ]);

    const keysToRemove = [];
    for (const key of url.searchParams.keys()) {
      if (!ALLOWED_PARAMS.has(key.toLowerCase())) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => url.searchParams.delete(key));

    if (url.hash && (url.hash.includes('utm_') || url.hash.includes('ref') || url.hash === '#')) {
      url.hash = '';
    }

    return url.toString();
  } catch {
    return urlStr;
  }
}

async function resolveUrl(url) {
  let currentUrl = url;
  let steps = 0;
  const maxSteps = 5;

  while (steps < maxSteps) {
    const isRedirect = isRedirector(currentUrl);
    const method = isRedirect ? 'GET' : 'HEAD';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(currentUrl, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });
      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currentUrl).toString();
          if (nextUrl === currentUrl) {
            break;
          }
          currentUrl = nextUrl;
          steps++;
          continue;
        }
      }
      
      if (method === 'HEAD') {
        const getController = new AbortController();
        const getTimeout = setTimeout(() => getController.abort(), 3000);
        
        const getResponse = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: getController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        clearTimeout(getTimeout);
        
        if (getResponse.status >= 300 && getResponse.status < 400) {
          const location = getResponse.headers.get('location');
          if (location) {
            currentUrl = new URL(location, currentUrl).toString();
            steps++;
            continue;
          }
        }
      }

      break;
    } catch (err) {
      pushLogCallback('system', `  ⚠️ Redirect resolution step failed for ${currentUrl}: ${err.message}`);
      break;
    }
  }

  return currentUrl;
}

function applyCategoryTags(existingTags, title = '', description = '', articleContent = [], providedInfo = '') {
  const cleanedExistingTags = new Set(existingTags.map(t => t.replace(/^#/, '').toLowerCase()));
  const finalTags = new Set(existingTags);

  const combinedText = [
    title,
    description,
    articleContent.join(' '),
    providedInfo
  ].filter(Boolean).join(' ').toLowerCase();

  // Special-case display tags that differ in casing from their config key.
  const DISPLAY_TAG_OVERRIDES = { homelab: '#homeLab' };

  const allCategories = config.categories || {};

  for (const [catKey, keywords] of Object.entries(allCategories)) {
    const normalizedKey = catKey.toLowerCase();
    let isMatched = cleanedExistingTags.has(normalizedKey);

    if (!isMatched) {
      isMatched = Array.isArray(keywords) && keywords.some(keyword => {
        return combinedText.includes(String(keyword).toLowerCase());
      });
    }

    if (isMatched) {
      const displayTag = DISPLAY_TAG_OVERRIDES[catKey] || `#${catKey}`;
      for (const tag of finalTags) {
        const cleanTag = tag.replace(/^#/, '').toLowerCase();
        if (cleanTag === normalizedKey) {
          finalTags.delete(tag);
        }
      }
      finalTags.add(displayTag);
    }
  }

  const resultTags = Array.from(finalTags).map(t => t.startsWith('#') ? t : `#${t}`);
  const filteredTags = resultTags.filter(t => t !== '#processedInfo');
  return ['#processedInfo', ...filteredTags];
}

async function processLink(parsed) {
  const { url, providedTitle, providedInfo, isMarkdownLink } = parsed;

  pushLogCallback('system', `  → Scraping: ${url}`);
  const meta = await scrapeUrl(url);

  const title = isMarkdownLink
    ? (providedTitle || meta.title || url)
    : (meta.title || providedTitle || url);

  let combinedNotes = providedInfo;
  if (!isMarkdownLink && providedTitle) {
    combinedNotes = combinedNotes ? `${providedTitle} | ${combinedNotes}` : providedTitle;
  }

  const hasScrapedTitle = meta.title && meta.title.trim().length > 0;
  const hasScrapedDesc = meta.description && meta.description.trim().length > 0;
  const hasScrapedArticle = meta.articleContent && meta.articleContent.length > 0;
  const hasScrapedContent = meta.success && (hasScrapedTitle || hasScrapedDesc || hasScrapedArticle);
  const hasUserContext = combinedNotes && combinedNotes.trim().length > 0;

  if (!hasScrapedContent && !hasUserContext) {
    throw new Error(`Scraper returned no content (login wall/blank page) and no context notes were provided.`);
  }

  pushLogCallback('system', '    🤖 Querying local LLM for smart tags, summary, and language...');
  const llmResult = await llmProcess({
    title,
    description: meta.description,
    articleContent: meta.articleContent || [],
    providedInfo: combinedNotes,
    siteName: meta.siteName,
    url,
  });

  if (!llmResult) {
    throw new Error('LLM request failed or returned malformed content');
  }

  const { tags: rawTags, summaryPoints } = llmResult;
  const tags = applyCategoryTags(rawTags, title, meta.description, meta.articleContent || [], combinedNotes);
  pushLogCallback('system', `    🤖 LLM Success! Tags: [${tags.join(', ')}]`);

  const finalSummaryPoints = [...summaryPoints];
  if (combinedNotes && combinedNotes.trim()) {
    const cleanNote = combinedNotes.trim().toLowerCase();
    const cleanTitle = (title || '').trim().toLowerCase();
    if (!cleanTitle.includes(cleanNote) && !cleanNote.includes(cleanTitle)) {
      finalSummaryPoints.unshift(combinedNotes.trim());
    }
  }

  const block = formatBlock({
    tags,
    url,
    sourceName: meta.siteName,
    title,
    summaryPoints: finalSummaryPoints,
  });

  return { block, meta };
}

async function processLinksFile(limitOverride = null) {
  if (isProcessing) {
    pushLogCallback('system', '⏳ Already processing, skipping...');
    return;
  }

  isProcessing = true;

  try {
    if (!fs.existsSync(config.inputFile)) {
      pushLogCallback('system', '⚠ Links.md not found, skipping.');
      return;
    }

    const content = fs.readFileSync(config.inputFile, 'utf-8');
    const parsedLinks = parseLinksFile(content);

    if (parsedLinks.length === 0) {
      pushLogCallback('system', 'ℹ No links found in Links.md.');
      return;
    }

    let limit = limitOverride;
    let linksToProcess = parsedLinks;
    if (limit && limit > 0) {
      linksToProcess = parsedLinks.slice(0, limit);
      pushLogCallback('system', `\n📋 Found ${parsedLinks.length} link(s) in Links.md, processing first ${linksToProcess.length} link(s)`);
    } else {
      pushLogCallback('system', `\n📋 Found ${parsedLinks.length} link(s) in Links.md`);
    }

    const newBlocks = [];
    const linesToRemove = [];
    const seenInBatch = new Set();
    const newLinksToProcess = [];

    // Pre-screen phase: check duplicates/history immediately
    for (const parsed of linksToProcess) {
      let url = parsed.url;
      let cleaned = cleanUrl(url);
      let normalized = history.normalize(cleaned);

      if (seenInBatch.has(normalized) || history.has(cleaned)) {
        pushLogCallback('system', `  ⊘ Duplicate, skipping: ${url}`);
        linesToRemove.push(...(parsed.associatedLineIndices || [parsed.lineIndex]));
        continue;
      }

      // If it looks like a redirector, check if we need to resolve it
      if (isRedirector(url)) {
        try {
          const resolved = await resolveUrl(url);
          if (resolved !== url) {
            const originalHost = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
            const resolvedHost = new URL(resolved).hostname.replace(/^www\./, '').toLowerCase();
            if (isRedirector(url) || originalHost !== resolvedHost) {
              pushLogCallback('system', `  🔗 Resolved redirect: ${url} → ${resolved}`);
              url = resolved;
            }
          }
        } catch (err) {
          pushLogCallback('system', `  ⚠️ Failed to resolve URL ${url}: ${err.message}`);
        }
        cleaned = cleanUrl(url);
        normalized = history.normalize(cleaned);

        if (seenInBatch.has(normalized) || history.has(cleaned)) {
          pushLogCallback('system', `  ⊘ Duplicate, skipping: ${url}`);
          linesToRemove.push(...(parsed.associatedLineIndices || [parsed.lineIndex]));
          continue;
        }
      }

      seenInBatch.add(normalized);
      newLinksToProcess.push({ ...parsed, cleanedUrl: cleaned });
    }

    // If we have duplicate lines to remove:
    if (linesToRemove.length > 0) {
      isPaused = true;
      cleanLinksFile(linesToRemove);
      setTimeout(() => {
        isPaused = false;
      }, 1000);

      // Trigger Git sync for the vault repository after successful writes.
      if (git.isEnabled()) {
        git.debouncedSync();
      }
    }

    if (newLinksToProcess.length === 0) {
      pushLogCallback('system', `✅ Done! 0 new, ${linesToRemove.length} duplicate(s) removed.\n`);
      return;
    }

    // Now check if LLM is active (since we actually have new links to process)
    const llmActive = await isLlmAvailable();
    if (!llmActive) {
      pushLogCallback('system', `⏳ Local LLM is offline/unavailable. Pausing processing for ${newLinksToProcess.length} new link(s).`);
      return;
    }

    const processedLinesToRemove = [];
    const unprocessedToMove = [];
    const extraLinks = [];

    // Process new links
    for (const parsed of newLinksToProcess) {
      const url = parsed.cleanedUrl;
      try {
        const { block, meta } = await processLink({ ...parsed, url });
        newBlocks.push(block);

        history.add(url);
        pushLogCallback('system', `  ✓ Processed: ${url}`);
        processedLinesToRemove.push(...(parsed.associatedLineIndices || [parsed.lineIndex]));

        // If this is a social media post, pick up any external web links it contains
        if (!parsed.skipExtract && isSocialMedia(url)) {
          const embedded = extractEmbeddedLinks(meta, url);
          let addedCount = 0;
          for (const eu of embedded) {
            const cleanedEu = cleanUrl(eu);
            const normalizedEu = history.normalize(cleanedEu);
            if (seenInBatch.has(normalizedEu) || history.has(cleanedEu)) continue;
            seenInBatch.add(normalizedEu);
            extraLinks.push({
              url: cleanedEu,
              cleanedUrl: cleanedEu,
              providedTitle: undefined,
              providedInfo: `Extracted from ${url}`,
              isMarkdownLink: false,
              lineIndex: null,
              associatedLineIndices: [],
              skipExtract: true
            });
            addedCount++;
            if (addedCount >= 3) break;
          }
          if (addedCount > 0) {
            pushLogCallback('system', `  🔗 Found ${addedCount} embedded link(s) in ${url}, queuing for processing.`);
          }
        }
      } catch (err) {
        pushLogCallback('system', `  ✗ Failed to process ${url}: ${err.message}`);
        unprocessedToMove.push({
          ...parsed,
          url,
          reason: err.message
        });
        processedLinesToRemove.push(...(parsed.associatedLineIndices || [parsed.lineIndex]));
      }
    }

    // Process links that were embedded inside social media posts
    for (const parsed of extraLinks) {
      const url = parsed.cleanedUrl;
      try {
        const { block } = await processLink({ ...parsed, url });
        newBlocks.push(block);
        history.add(url);
        pushLogCallback('system', `  ✓ Processed embedded link: ${url}`);
      } catch (err) {
        pushLogCallback('system', `  ✗ Failed to process embedded link ${url}: ${err.message}`);
        unprocessedToMove.push({
          ...parsed,
          url,
          reason: err.message
        });
      }
    }

    if (unprocessedToMove.length > 0) {
      appendToUnprocessed(unprocessedToMove);
      pushLogCallback('system', `📋 Moved ${unprocessedToMove.length} unprocessable link(s) to unprocessed.md`);
    }

    if (newBlocks.length > 0) {
      const formattedOutput = formatBlocks(newBlocks);
      appendToJournal(formattedOutput);
      pushLogCallback('system', `\n📝 Wrote ${newBlocks.length} block(s) to journal`);
    }

    history.save();

    if (processedLinesToRemove.length > 0) {
      isPaused = true;
      cleanLinksFile(processedLinesToRemove);
      setTimeout(() => {
        isPaused = false;
      }, 1000);

      // Trigger Git sync for the vault repository after successful writes.
      if (git.isEnabled()) {
        git.debouncedSync();
      }
    }

    const processedCount = newBlocks.length;
    const dupeCount = linesToRemove.length;
    pushLogCallback('system', `✅ Done! ${processedCount} new, ${dupeCount} duplicate(s) removed.\n`);

  } catch (err) {
    pushLogCallback('system', `✗ Processing error: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

function onFileChange() {
  if (isPaused) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    processLinksFile();
  }, config.debounceMs);
}

function startWatcher() {
  if (watcher) {
    try {
      watcher.close();
    } catch (err) {
      // Ignore
    }
  }

  if (!fs.existsSync(config.inputFile)) {
    pushLogCallback('system', `⚠ Input file ${config.inputFile} does not exist. Watcher not started.`);
    return;
  }

  watcher = chokidar.watch(config.inputFile, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on('change', onFileChange);
  watcher.on('add', onFileChange);
  pushLogCallback('system', `👁 File watcher active on: ${config.inputFile}`);
}

function getWatcherStatus() {
  return {
    watcherActive: !!watcher,
    isProcessing,
    isPaused
  };
}

function getQueueLinks() {
  if (!fs.existsSync(config.inputFile)) return [];
  const content = fs.readFileSync(config.inputFile, 'utf-8');
  return parseLinksFile(content);
}

function getHistoryLog(limit = null) {
  return history.getAll(limit);
}

function init({ getLlmPort, pushLog, initialConfig }) {
  if (pushLog) {
    pushLogCallback = pushLog;
  }
  setLlmPortCallback(getLlmPort);

  if (initialConfig && initialConfig.linkProcessor) {
    updateRuntimeConfig(initialConfig.linkProcessor);
  }

  history.load();
  pushLogCallback('system', `[Link Processor] Loaded ${history.size} previously processed URL(s)`);

  startWatcher();

  // Initialize Git auto-sync for the Obsidian vault repository.
  git.init(pushLogCallback);

  // Set up periodic fallback check every 1 minute to catch new links in D:\Documents\obsidian\Links.md
  if (periodicInterval) {
    clearInterval(periodicInterval);
  }
  periodicInterval = setInterval(() => {
    const links = getQueueLinks();
    if (links.length > 0 && !isProcessing && !isPaused) {
      pushLogCallback('system', `⏰ Periodic check: Found ${links.length} pending link(s) in queue. Triggering auto-processing...`);
      processLinksFile();
    }
  }, 60000);
}

function updateConfig(newSettings) {
  updateRuntimeConfig(newSettings);
  startWatcher();
  git.init(pushLogCallback);
}

module.exports = {
  init,
  processLinksFile,
  getWatcherStatus,
  getQueueLinks,
  getHistoryLog,
  updateConfig,
  config,
  isSocialMedia,
  extractEmbeddedLinks,
  cleanUrl
};
