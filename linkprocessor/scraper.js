const ogs = require('open-graph-scraper');
const cheerio = require('cheerio');
const { parse: parseDomain } = require('tldts');
const { config } = require('./config');

function titleCase(str) {
  return str
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function getSourceName(url, ogResult) {
  if (ogResult?.ogSiteName) {
    return ogResult.ogSiteName;
  }

  try {
    const parsed = parseDomain(url);
    if (parsed?.domain) {
      const domainWithoutTld = parsed.domainWithoutSuffix || parsed.domain.split('.')[0];
      const knownSources = {
        'github': 'GitHub',
        'youtube': 'YouTube',
        'reddit': 'Reddit',
        'twitter': 'Twitter',
        'x': 'X (Twitter)',
        'medium': 'Medium',
        'substack': 'Substack',
        'linkedin': 'LinkedIn',
        'hackernews': 'Hacker News',
        'news.ycombinator': 'Hacker News',
        'arxiv': 'arXiv',
        'wikipedia': 'Wikipedia',
        'nytimes': 'The New York Times',
        'bbc': 'BBC',
        'theguardian': 'The Guardian',
        'washingtonpost': 'The Washington Post',
        'techcrunch': 'TechCrunch',
        'theverge': 'The Verge',
        'arstechnica': 'Ars Technica',
        'digi24': 'Digi24',
        'hotnews': 'HotNews',
        'mediafax': 'Mediafax',
        'libertatea': 'Libertatea',
        'protv': 'ProTV',
        'stirileprotv': 'Știrile ProTV',
        'adevarul': 'Adevărul',
        'zf': 'Ziarul Financiar',
      };

      const lower = domainWithoutTld.toLowerCase();
      if (knownSources[lower]) {
        return knownSources[lower];
      }

      return titleCase(domainWithoutTld);
    }
  } catch {
    // Fallback
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return titleCase(hostname.split('.')[0]);
  } catch {
    return 'Unknown';
  }
}

function extractArticleContent(html) {
  if (!html) return [];

  const $ = cheerio.load(html);

  $('script, style, nav, header, footer, aside, iframe, form, noscript, svg, figure, figcaption').remove();
  $('[role="navigation"], [role="banner"], [role="complementary"], [role="contentinfo"]').remove();
  $('.nav, .navbar, .menu, .sidebar, .footer, .header, .ad, .ads, .advertisement, .cookie, .popup, .modal').remove();
  $('.social-share, .share-buttons, .related-articles, .comments, .comment-section').remove();

  const contentSelectors = [
    'article .entry-content',
    'article .post-content',
    'article .article-content',
    'article .article-body',
    'article .story-body',
    'article .content-body',
    '.post-content',
    '.article-content',
    '.article-body',
    '.entry-content',
    '.story-body',
    '.content-body',
    '[itemprop="articleBody"]',
    '[data-component="text-block"]',
    'article',
    '[role="main"]',
    'main',
    '.content',
    '#content',
  ];

  let rawParagraphs = [];

  for (const selector of contentSelectors) {
    const container = $(selector).first();
    if (container.length > 0) {
      container.find('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30 && !text.startsWith('©') && !text.toLowerCase().startsWith('cookie')) {
          rawParagraphs.push(text);
        }
      });

      if (rawParagraphs.length >= 2) break;
    }
  }

  if (rawParagraphs.length < 2) {
    $('body p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30 && !text.startsWith('©') && !text.toLowerCase().startsWith('cookie')) {
        rawParagraphs.push(text);
      }
    });
  }

  // Preserve natural reading order (intro -> body -> conclusion)
  const seen = new Set();
  const ordered = [];
  let totalChars = 0;
  const MAX_TOTAL_CHARS = 14000;

  for (const p of rawParagraphs) {
    const key = p.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);

    ordered.push(p);
    totalChars += p.length;
    if (totalChars >= MAX_TOTAL_CHARS) break;
  }

  return ordered;
}

function extractYouTubeId(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2];
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2];
      }
    } else if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0];
    }
  } catch {}
  return null;
}

async function fetchYouTubeTranscript(videoId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const rawText = await res.text();
    if (!rawText || rawText.length < 50) return null;

    let extractedTitle = '';
    const titleMatch = rawText.match(/^#\s*Transcript:\s*(.+)$/m);
    if (titleMatch) {
      extractedTitle = titleMatch[1].trim();
    }

    // Extract text after ## Transcript
    const transcriptPart = rawText.includes('## Transcript')
      ? rawText.split('## Transcript')[1]
      : rawText;

    // Clean timestamps like [0:23] or [12:45] and condense
    const cleanLines = transcriptPart
      .replace(/\[\d+:\d+(?::\d+)?\]/g, ' ')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('Source video:') && !l.startsWith('Language:'));

    const fullTranscript = cleanLines.join(' ').replace(/\s+/g, ' ');
    if (fullTranscript.length < 30) return null;

    // Split into readable paragraph chunks up to 14,000 characters
    const paragraphs = [];
    const maxChars = 14000;
    const truncated = fullTranscript.slice(0, maxChars);
    const chunkSize = 1500;
    for (let i = 0; i < truncated.length; i += chunkSize) {
      paragraphs.push(truncated.slice(i, i + chunkSize));
    }

    return {
      title: extractedTitle,
      paragraphs,
    };
  } catch (err) {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.scraperTimeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

async function scrapeUrl(url) {
  const fallback = {
    title: '',
    description: '',
    siteName: getSourceName(url, null),
    url,
    articleContent: [],
    success: false,
  };

  try {
    const ytId = extractYouTubeId(url);
    let ytTranscript = null;
    if (ytId) {
      ytTranscript = await fetchYouTubeTranscript(ytId);
    }

    const html = await fetchHtml(url);

    let ogResult = null;
    try {
      const ogsOptions = html
        ? { html }
        : { url, timeout: config.scraperTimeout, fetchOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
            },
          }};

      const { result, error } = await ogs(ogsOptions);
      if (!error) {
        ogResult = result;
      }
    } catch {
      // OG extraction failed
    }

    let articleContent = extractArticleContent(html);
    let title = ogResult?.ogTitle || ogResult?.twitterTitle || ogResult?.dcTitle || '';
    let description = ogResult?.ogDescription || ogResult?.twitterDescription || ogResult?.dcDescription || '';
    let siteName = getSourceName(url, ogResult);

    if (ytTranscript && ytTranscript.paragraphs.length > 0) {
      siteName = 'YouTube';
      if (!title && ytTranscript.title) {
        title = ytTranscript.title;
      }
      articleContent = ytTranscript.paragraphs;
    }

    return {
      title: title.trim(),
      description: description.trim(),
      siteName,
      url,
      articleContent,
      success: true,
    };
  } catch (err) {
    console.warn(`  ⚠ Scrape failed for ${url}: ${err.message}`);
    return { ...fallback, error: err.message };
  }
}

module.exports = {
  scrapeUrl
};
