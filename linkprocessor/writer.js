const fs = require('fs');
const path = require('path');
const { config } = require('./config');

function appendToJournal(formattedContent, date = new Date()) {
  const filename = config.getJournalFilename(date);
  const filepath = path.join(config.journalsDir, filename);

  try {
    if (fs.existsSync(filepath)) {
      const existing = fs.readFileSync(filepath, 'utf-8');
      const trimmedExisting = existing.replace(/\n+$/, '');
      const newContent = trimmedExisting + '\n\n\n' + formattedContent + '\n';
      fs.writeFileSync(filepath, newContent, 'utf-8');
      console.log(`  ✓ Appended to existing journal: ${filename}`);
    } else {
      fs.writeFileSync(filepath, formattedContent + '\n', 'utf-8');
      console.log(`  ✓ Created new journal file: ${filename}`);
    }
  } catch (err) {
    console.error(`  ✗ Failed to write journal ${filename}: ${err.message}`);
    throw err;
  }
}

function cleanLinksFile(lineIndicesToRemove) {
  if (lineIndicesToRemove.length === 0) return false;

  try {
    const content = fs.readFileSync(config.inputFile, 'utf-8');
    const lines = content.split(/\r?\n/);

    const removeSet = new Set(lineIndicesToRemove);
    const remaining = lines.filter((_, idx) => !removeSet.has(idx));

    const newContent = remaining.join('\n');

    if (newContent === content) return false;

    fs.writeFileSync(config.inputFile, newContent, 'utf-8');
    console.log(`  ✓ Cleaned ${lineIndicesToRemove.length} line(s) from Links.md`);
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to clean Links.md: ${err.message}`);
    return false;
  }
}

function appendToUnprocessed(items) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return;

  const vaultDir = path.dirname(config.inputFile);
  const unprocessedPath = path.join(vaultDir, 'unprocessed.md');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const lines = [];
  for (const item of list) {
    const url = item.url || item.cleanedUrl;
    const title = item.providedTitle || item.title || '';
    const note = item.providedInfo || '';
    const reason = item.reason || 'Failed to process / unreachable';

    let header = url;
    if (title && note) {
      header = `**${title}** (${note}) - ${url}`;
    } else if (title) {
      header = `**${title}** - ${url}`;
    } else if (note) {
      header = `(${note}) - ${url}`;
    }

    lines.push(`- ${header}`);
    lines.push(`  failed_at:: ${now}`);
    lines.push(`  reason:: ${reason}`);
    lines.push('');
  }

  const contentToAppend = lines.join('\n') + '\n';

  try {
    if (fs.existsSync(unprocessedPath)) {
      fs.appendFileSync(unprocessedPath, '\n' + contentToAppend, 'utf-8');
    } else {
      fs.writeFileSync(unprocessedPath, '# Unprocessed Links\n\n' + contentToAppend, 'utf-8');
    }
    console.log(`  ✓ Moved ${list.length} failed link(s) to unprocessed.md`);
  } catch (err) {
    console.error(`  ✗ Failed to write to unprocessed.md: ${err.message}`);
  }
}

module.exports = {
  appendToJournal,
  cleanLinksFile,
  appendToUnprocessed
};
