# Link Processor Agent Instructions

This folder contains the **Link Processor** â€” a Node.js module that watches an Obsidian `Links.md` file, scrapes URLs, enriches them via a local LLM, and writes formatted journal entries to a Logseq/Obsidian journals directory.

---

## Architecture

```
linkprocessor/
â”œâ”€â”€ index.js       # Main entry point: watcher, processor, git sync trigger
â”œâ”€â”€ config.js      # Runtime config (paths, categories, git settings)
â”œâ”€â”€ git.js         # Git automation: pull, add, commit, push, status
â”œâ”€â”€ parser.js      # Extracts URLs + metadata from Links.md lines
â”œâ”€â”€ scraper.js     # Fetches HTML, extracts title/description/article
â”œâ”€â”€ llm.js         # Calls local llama-server for tags/summary/language
â”œâ”€â”€ formatter.js   # Formats LLM output into journal markdown blocks
â”œâ”€â”€ writer.js      # Appends blocks to daily journal file; cleans Links.md
â”œâ”€â”€ history.js     # Tracks processed URLs (deduplication)
â”œâ”€â”€ tagger.js      # Keyword-based category tagging
â”œâ”€â”€ language.js    # Language detection (franc)
â””â”€â”€ AGENTS.md      # This file
```

**External dependencies (in parent):**
- `server.js` â€” Express backend exposing REST + SSE endpoints
- `frontend/` â€” Vite/Vanilla JS dashboard (Link Processor tab)

---

## Data Flow

1. **File Watcher** (`chokidar`) monitors `config.inputFile` (default `obsidian/Links.md`)
2. On change â†’ `parseLinksFile()` extracts URLs + optional title, yields `{url, providedTitle, providedInfo, isMarkdownLink, lineIndex}`
3. For each new URL:
   - `resolveUrl()` follows redirects (HEAD â†’ GET fallback)
   - `cleanUrl()` strips UTM/tracking params
   - `scrapeUrl()` fetches HTML, uses `cheerio` + `open-graph-scraper`
   - `llmProcess()` sends title/desc/article/user-notes to local LLM â†’ returns `{tags[], summaryPoints[], language}`
   - `applyCategoryTags()` adds keyword-based tags (SUC, homelab, localLLM, etc.)
   - `formatBlock()` builds markdown block
4. `appendToJournal()` writes to `config.journalsDir/YYYY_MM_DD.md`
5. `cleanLinksFile()` removes processed lines from `Links.md`
6. `history.add()` records URL â†’ `processed_history.json`
7. **Git Sync** (`git.debouncedSync()`): stages, commits, pushes vault

---

## Configuration

### `config.js` Runtime Defaults
```js
{
  inputFile: 'obsidian/Links.md',
  journalsDir: 'obsidian/journals',
  historyFile: 'processed_history.json',
  debounceMs: 2000,
  categories: { SUC: [...], homelab: [...], ... },
  git: {
    enabled: false,
    repoPath: 'obsidian',
    autoPull: true,
    autoCommit: true,
    autoPush: true,
    pullIntervalMinutes: 5,
    pushDebounceMs: 30000,
    remoteName: 'origin',
    name: 'Link Processor',
    email: 'link-processor@local',
    commitMessageTemplate: 'Auto-sync: {count} file(s) changed on {date}'
  }
}
```

### Persistent Config (`config.json` at project root)
```json
{
  "linkProcessor": {
    "inputFile": "obsidian/Links.md",
    "journalsDir": "obsidian/journals",
    "git": { "enabled": true, "repoPath": "obsidian", ... }
  }
}
```

**Override at runtime** via `POST /api/link-processor/config`.

---

## Git Sync (Option 1: Git Approach)

The `git.js` module automates the vault repository:

| Feature | Config | Default |
|---------|--------|---------|
| Enabled | `git.enabled` | `false` |
| Repo path | `git.repoPath` | `obsidian` (dirname of inputFile) |
| Auto-pull | `git.autoPull` | `true` (every 5 min) |
| Auto-commit | `git.autoCommit` | `true` |
| Auto-push | `git.autoPush` | `true` (debounced 30s) |
| Commit msg | `git.commitMessageTemplate` | `"Auto-sync: {count} file(s) changed on {date}"` |

**Prerequisites (run once):**
```bash
cd obsidian
git init
git branch -M main
git remote add origin https://github.com/YOUR_USER/obsidian-vault.git
echo -e ".obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.stfolder/" > .gitignore
git add .
git commit -m "Initial sync"
git push -u origin main
```

---

## REST API (mounted on main server `:3000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/link-processor/status` | Watcher, LLM, **git** status |
| GET | `/api/link-processor/queue` | Pending links in Links.md |
| POST | `/api/link-processor/process` | Trigger processing `{limit?: number}` |
| GET | `/api/link-processor/config` | Current config (incl. git) |
| POST | `/api/link-processor/config` | Update config (persists to `config.json`) |
| GET | `/api/link-processor/history` | Processed URL history |
| GET | `/api/link-processor/git/status` | Detailed git status (branch, ahead/behind, dirty) |
| POST | `/api/link-processor/git/sync` | Manual pull â†’ commit â†’ push |
| GET | `/api/link-processor/git/config` | Git config subset |
| POST | `/api/link-processor/git/config` | Update git config |

---

## Frontend (Link Processor Tab)

- **Status badges**: Watcher (idle/processing), LLM (online/offline)
- **Queue list**: Pending links with titles
- **Actions**: Process 1 / Batch (10) / All
- **Config form**: inputFile, journalsDir, debounceMs
- **Categories grid**: Tags + keyword counts
- **History list**: Recently processed URLs
- **Git Sync card**: Toggle switch, live status (repo, branch, remote, ahead/behind, dirty), "Sync Now" button

---

## Running / Testing

```bash
# From project root (localLLM)
npm start           # Starts server.js on :3000
npm run dev         # Server + Vite HMR
```

- Open `http://localhost:3000` â†’ **Link Processor** tab
- Add URLs to `obsidian/Links.md` (one per line, or `[Title](url) notes`)
- Watch journal appear in `obsidian/journals/YYYY_MM_DD.md`

---

## Key Implementation Notes

- **No external Git library** â€” uses `child_process.exec` with `cwd: repoPath`
- **Debounced push** â€” multiple rapid writes coalesce into one commit
- **Periodic pull** â€” `setInterval` (default 5 min) pulls remote changes
- **Config is live** â€” `updateRuntimeConfig()` mutates the exported `config` object; `git.js` reads it by reference
- **History dedupe** â€” `history.normalize()` lowercases host, strips trailing `/`, removes UTM params
- **LLM availability** â€” polls `isLlmAvailable()` (hits `GET /health` on llama-server port) before processing
- **Packaged build** â€” `npm run bundle` â†’ `server_bundled.js` â†’ `pkg` â†’ `LlamaLaunch.exe`; `historyFile` uses `process.cwd()` when packaged

---

## Common Tasks

| Task | How |
|------|-----|
| Change vault location | Edit `config.json` â†’ `linkProcessor.inputFile`, `journalsDir`, `git.repoPath`; restart server |
| Add category keywords | Edit `categories.json` at project root or `config.json` â†’ `linkProcessor.categories` |
| Disable git sync | Set `git.enabled: false` in config or toggle OFF in UI |
| Force manual sync | `POST /api/link-processor/git/sync` or click "Sync Now" in UI |
| View git status | `GET /api/link-processor/git/status` |
| Debug parser | `node -e "const p=require('./linkprocessor/parser'); console.log(p.parseLinksFile(require('fs').readFileSync('obsidian/Links.md','utf-8')))"` |

---

## File Ownership

- **linkprocessor/** â€” All JS modules, this AGENTS.md
- **obsidian/** â€” **Only vault files to sync** (Links.md, journals/, .git/, .gitignore, .obsidian/ config)
- **Root** â€” server.js, config.json, package.json, frontend/, README.md
## MCP Usage Policy
- **Do NOT proactively use, invoke, or suggest MCP tools** unless the user explicitly requests one by name.
- Only call an MCP tool when the user clearly names it in their request (e.g., *"use the Blender MCP"*, *"use the Trello MCP"*, *"use Home Assistant MCP"*).
- Do not auto-select an MCP tool just because it seems relevant to the task — always wait for an explicit opt-in.
- If an MCP could help but wasn't asked for, you may briefly mention it as an option, but do not call it.