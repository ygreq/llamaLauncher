// Links.md line parser
// Extracts URLs and optional metadata from each line

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null; // Skip empty lines, comments, headings
  }

  // Pattern 1: Markdown link [Title](URL) possibly with extra text
  const mdLinkMatch = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*(.*)?$/);
  if (mdLinkMatch) {
    return {
      url: mdLinkMatch[2],
      providedTitle: mdLinkMatch[1].trim() || undefined,
      providedInfo: mdLinkMatch[3]?.trim() || undefined,
      isMarkdownLink: true,
    };
  }

  // Find the URL anywhere in the line
  const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) {
    return null; // No URL found in line
  }

  const url = urlMatch[1];
  const urlIndex = trimmed.indexOf(url);

  // Text before the URL
  let before = trimmed.substring(0, urlIndex).trim();
  // Text after the URL
  let after = trimmed.substring(urlIndex + url.length).trim();

  // Clean up separators from the "before" text (e.g., "Title - " or "Title: ")
  before = before.replace(/[\s\-–—:]+$/, '').trim();

  // Determine providedTitle and providedInfo
  let providedTitle = undefined;
  let providedInfo = undefined;

  if (before && after) {
    providedTitle = before;
    providedInfo = after;
  } else if (before) {
    providedTitle = before;
  } else if (after) {
    providedInfo = after;
  }

  return {
    url,
    providedTitle: providedTitle || undefined,
    providedInfo: providedInfo || undefined,
    isMarkdownLink: false,
  };
}

function parseLinksFile(content) {
  const lines = content.split(/\r?\n/);
  const results = [];
  let accumulatedText = [];
  let accumulatedIndices = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const parsed = parseLine(line);

    if (parsed) {
      let providedInfo = parsed.providedInfo || '';
      if (accumulatedText.length > 0) {
        const mergedText = accumulatedText.join('\n');
        providedInfo = providedInfo ? `${mergedText}\n${providedInfo}` : mergedText;
      }

      results.push({
        ...parsed,
        providedInfo: providedInfo || undefined,
        lineIndex: i,
        associatedLineIndices: [...accumulatedIndices, i]
      });

      accumulatedText = [];
      accumulatedIndices = [];
    } else {
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        accumulatedText.push(line);
      }
      accumulatedIndices.push(i);
    }
  }

  return results;
}

module.exports = {
  parseLine,
  parseLinksFile
};
