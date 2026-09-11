function formatBlock({ tags, url, sourceName, title, summaryPoints }) {
  const lines = [];
  lines.push(`- ${tags.join(' ')}`);
  lines.push(`  link:: ${url}`);
  lines.push(`  source:: [[${sourceName}]]`);
  lines.push(`\t- **${title}**`);
  for (const point of summaryPoints) {
    lines.push(`\t\t- ${point}`);
  }
  return lines.join('\n');
}

function generateSummaryPoints({ description, articleContent = [], providedInfo, title, siteName, language }) {
  const points = [];
  const usedTexts = new Set();

  function isDuplicate(text) {
    const lower = text.toLowerCase().trim();
    if (lower.length < 15) return true;

    const titleLower = (title || '').toLowerCase();
    if (lower === titleLower || titleLower.includes(lower) || lower.includes(titleLower)) {
      return true;
    }

    for (const used of usedTexts) {
      const usedLower = used.toLowerCase();
      const wordsA = new Set(lower.split(/\s+/));
      const wordsB = new Set(usedLower.split(/\s+/));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const overlap = intersection / Math.min(wordsA.size, wordsB.size);
      if (overlap > 0.6) return true;
    }

    return false;
  }

  function addPoint(text) {
    if (!text || points.length >= 3) return false;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 15 || isDuplicate(cleaned)) return false;

    let final = cleaned;
    if (final.length > 300) {
      final = final.slice(0, 297) + '...';
    }

    points.push(final);
    usedTexts.add(final);
    return true;
  }

  if (description && description.length > 30) {
    addPoint(description);
  }

  if (articleContent.length > 0) {
    for (const paragraph of articleContent) {
      if (points.length >= 3) break;
      addPoint(paragraph);
    }
  }

  if (providedInfo && providedInfo.length > 3) {
    if (points.length >= 3) {
      points[2] = providedInfo;
    } else {
      addPoint(providedInfo) || points.push(providedInfo);
    }
  }

  if (points.length < 2) {
    if (language === 'ro') {
      addPoint(`Publicat pe ${siteName}.`) || points.push(`Publicat pe ${siteName}.`);
    } else {
      addPoint(`Published on ${siteName}.`) || points.push(`Published on ${siteName}.`);
    }
  }

  if (points.length < 2) {
    if (language === 'ro') {
      points.push(`Sursă: ${siteName}.`);
    } else {
      points.push(`Source: ${siteName}.`);
    }
  }

  return points.slice(0, 3);
}

function formatBlocks(blocks) {
  return blocks.join('\n\n\n');
}

module.exports = {
  formatBlock,
  generateSummaryPoints,
  formatBlocks
};
