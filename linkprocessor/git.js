const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');

let pushLogCallback = console.log;
let gitInterval = null;
let pendingPushTimer = null;
let lastPushAt = 0;

function log(type, text) {
  pushLogCallback(type, text);
}

function getRepoPath() {
  const cfg = config.git || {};
  if (cfg.repoPath) return cfg.repoPath;
  // Default to the folder containing the input Links.md file
  return path.dirname(config.inputFile);
}

function runGit(args, options = {}) {
  const repoPath = getRepoPath();
  return new Promise((resolve, reject) => {
    exec(
      `git ${args}`,
      {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: config.git?.name || 'Link Processor',
          GIT_AUTHOR_EMAIL: config.git?.email || 'link-processor@local',
          GIT_COMMITTER_NAME: config.git?.name || 'Link Processor',
          GIT_COMMITTER_EMAIL: config.git?.email || 'link-processor@local',
        },
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || stdout?.trim() || error.message;
          return reject(new Error(`git ${args} failed: ${details}`));
        }
        resolve(stdout.trim());
      }
    );
  });
}

function isEnabled() {
  const cfg = config.git || {};
  return cfg.enabled === true;
}

async function ensuresRepo() {
  const repoPath = getRepoPath();
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Git repo path does not exist: ${repoPath}`);
  }
  try {
    await runGit('rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

async function getStatus() {
  if (!isEnabled()) {
    return { enabled: false, repoPath: getRepoPath(), isRepo: false };
  }

  const repoPath = getRepoPath();
  try {
    const isRepo = await ensuresRepo();
    const status = { enabled: true, repoPath, isRepo };

    if (!isRepo) return status;

    const branch = await runGit('rev-parse --abbrev-ref HEAD').catch(() => 'unknown');
    const remote = await runGit('remote get-url origin').catch(() => null);
    const statusOutput = await runGit('status --porcelain=v1').catch(() => '');
    const hasChanges = statusOutput.trim().length > 0;
    const aheadBehind = await runGit('rev-list --left-right --count HEAD...@{u}')
      .then(out => {
        const [ahead, behind] = out.split(/\s+/).map(n => parseInt(n, 10) || 0);
        return { ahead, behind };
      })
      .catch(() => ({ ahead: 0, behind: 0 }));

    status.branch = branch;
    status.remote = remote;
    status.hasChanges = hasChanges;
    status.ahead = aheadBehind.ahead;
    status.behind = aheadBehind.behind;
    status.statusText = statusOutput;
    return status;
  } catch (err) {
    return { enabled: true, repoPath, isRepo: false, error: err.message };
  }
}

async function stageAll() {
  return runGit('add -A');
}

async function commit(message) {
  const msg = (message || '').replace(/"/g, '\\"');
  return runGit(`commit -m "${msg}" --no-verify`);
}

async function push() {
  const cfg = config.git || {};
  const branch = await runGit('rev-parse --abbrev-ref HEAD').catch(() => 'main');
  return runGit(`push ${cfg.remoteName || 'origin'} ${branch}`);
}

async function pull() {
  const cfg = config.git || {};
  const branch = await runGit('rev-parse --abbrev-ref HEAD').catch(() => 'main');
  return runGit(`pull --no-edit --rebase=false ${cfg.remoteName || 'origin'} ${branch}`);
}

async function sync(opts = {}) {
  if (!isEnabled()) {
    log('system', 'ℹ Git sync is disabled.');
    return { success: true, skipped: true };
  }

  const isRepo = await ensuresRepo().catch(() => false);
  if (!isRepo) {
    log('system', `⚠ Git sync skipped: ${getRepoPath()} is not a git repository.`);
    return { success: false, error: 'Not a git repository' };
  }

  try {
    let committed = false;
    let status = await getStatus();

    // Stage and commit local changes first (if any) to clean the working directory
    // before pulling, avoiding Git conflicts on unstaged files like Links.md
    if (status.hasChanges) {
      log('system', '📝 Staging and committing local changes...');
      await stageAll();

      const count = (status.statusText || '').split(/\r?\n/).filter(Boolean).length;
      const date = new Date().toISOString();
      const template = config.git?.commitMessageTemplate || 'Auto-sync: {count} file(s) changed on {date}';
      const message = template
        .replace(/{count}/g, String(count))
        .replace(/{date}/g, date);

      await commit(message);
      log('system', '✅ Committed local changes.');
      committed = true;
    }

    if (config.git?.autoPull !== false || opts.forcePull) {
      log('system', '🔄 Pulling latest changes from remote...');
      await pull();
      log('system', '✅ Pull complete.');
    }

    if (config.git?.autoPush !== false || opts.forcePush) {
      const updatedStatus = await getStatus();
      if (updatedStatus.ahead > 0 || committed || opts.forcePush) {
        log('system', '⬆ Pushing to remote...');
        await push();
        lastPushAt = Date.now();
        log('system', '✅ Push complete.');
        return { success: true, committed, pushed: true };
      }
    }

    return { success: true, committed, pushed: false };
  } catch (err) {
    log('system', `✗ Git sync failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

function debouncedSync() {
  const cfg = config.git || {};
  if (!isEnabled() || cfg.autoPush === false) return;

  if (pendingPushTimer) {
    clearTimeout(pendingPushTimer);
  }

  const debounceMs = cfg.pushDebounceMs ?? 30000;
  pendingPushTimer = setTimeout(() => {
    sync();
  }, debounceMs);
  log('system', `⏳ Git push scheduled in ${Math.round(debounceMs / 1000)}s...`);
}

async function init(_pushLog) {
  if (_pushLog) pushLogCallback = _pushLog;

  const cfg = config.git || {};
  if (!isEnabled()) return;

  const repoPath = getRepoPath();
  log('system', `[Git Sync] Enabled for repo: ${repoPath}`);

  if (gitInterval) {
    clearInterval(gitInterval);
    gitInterval = null;
  }

  const intervalMinutes = cfg.pullIntervalMinutes ?? 5;
  if (intervalMinutes > 0 && cfg.autoPull !== false) {
    log('system', `[Git Sync] Auto-sync every ${intervalMinutes} minute(s).`);
    gitInterval = setInterval(async () => {
      try {
        await sync();
        log('system', '🔄 Periodic Git sync complete.');
      } catch (err) {
        log('system', `⚠ Periodic Git sync failed: ${err.message}`);
      }
    }, intervalMinutes * 60 * 1000);
  }

  // Run an initial sync asynchronously on startup
  Promise.resolve().then(async () => {
    try {
      log('system', '[Git Sync] Running initial startup sync...');
      await sync();
      log('system', '✅ Initial startup sync complete.');
    } catch (err) {
      log('system', `⚠ Initial startup sync failed: ${err.message}`);
    }
  });
}

function stop() {
  if (gitInterval) {
    clearInterval(gitInterval);
    gitInterval = null;
  }
  if (pendingPushTimer) {
    clearTimeout(pendingPushTimer);
    pendingPushTimer = null;
  }
}

module.exports = {
  init,
  stop,
  isEnabled,
  getRepoPath,
  getStatus,
  sync,
  pull,
  push,
  commit,
  stageAll,
  debouncedSync,
};
