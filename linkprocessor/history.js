const fs = require('fs');
const { config } = require('./config');

class History {
  constructor() {
    this.entries = []; // Array of {url, timestamp}
    this.filePath = config.historyFile;
  }

  normalize(url) {
    try {
      const parsed = new URL(url);
      parsed.hostname = parsed.hostname.toLowerCase();
      if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
      trackingParams.forEach(p => parsed.searchParams.delete(p));
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url.toLowerCase().replace(/\/+$/, '');
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (Array.isArray(data)) {
          // Backward compatibility: old format was just array of URL strings
          if (data.length > 0 && typeof data[0] === 'string') {
            this.entries = data.map(url => ({ url: this.normalize(url), timestamp: null }));
          } else {
            this.entries = data.map(e => ({
              url: this.normalize(e.url || e),
              timestamp: e.timestamp || null
            }));
          }
        }
      }
    } catch (err) {
      console.warn(`⚠ Could not load history file: ${err.message}. Starting fresh.`);
      this.entries = [];
    }
    return this;
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err) {
      console.error(`✗ Failed to save history: ${err.message}`);
    }
    return this;
  }

  has(url) {
    const norm = this.normalize(url);
    return this.entries.some(e => e.url === norm);
  }

  add(url) {
    const norm = this.normalize(url);
    // Remove existing entry for same URL (to update timestamp)
    this.entries = this.entries.filter(e => e.url !== norm);
    // Add new entry at the beginning (most recent first)
    this.entries.unshift({ url: norm, timestamp: new Date().toISOString() });
    return this;
  }

  get size() {
    return this.entries.length;
  }

  getAll(limit = null) {
    if (limit && limit > 0) {
      return this.entries.slice(0, limit);
    }
    return [...this.entries];
  }
}

const history = new History();
module.exports = history;
