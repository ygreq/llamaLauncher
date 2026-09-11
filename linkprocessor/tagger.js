const keywordExtractor = require('keyword-extractor');

function toPascalCase(str) {
  return str
    .split(/[\s\-_\/\\.,:;!?]+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function extractPathKeywords(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname
      .split(/[\/\-_]+/)
      .filter(seg => seg.length > 2 && !/^\d+$/.test(seg))
      .map(seg => seg.toLowerCase());
  } catch {
    return [];
  }
}

function extractTags({ title, description, url, language }) {
  const allText = [title, description].filter(Boolean).join(' ');

  let keywords = [];
  try {
    keywords = keywordExtractor.extract(allText, {
      language: language === 'ro' ? 'ro' : 'en',
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: true,
    });
  } catch {
    keywords = allText
      .toLowerCase()
      .split(/[\s\-_,.:;!?()[\]{}'"]+/)
      .filter(w => w.length > 3);
  }

  const pathKeywords = extractPathKeywords(url);

  const scores = new Map();

  if (title) {
    const titleWords = title.toLowerCase().split(/[\s\-_,.:;!?()[\]{}'"]+/).filter(w => w.length > 3);
    titleWords.forEach((w, i) => {
      scores.set(w, (scores.get(w) || 0) + 3 - (i * 0.1));
    });
  }

  keywords.forEach((w, i) => {
    if (w.length > 3) {
      scores.set(w, (scores.get(w) || 0) + 2 - (i * 0.05));
    }
  });

  pathKeywords.forEach(w => {
    if (w.length > 3) {
      scores.set(w, (scores.get(w) || 0) + 1);
    }
  });

  const stopWords = new Set([
    'http', 'https', 'html', 'article', 'page', 'post', 'index', 'comment',
    'comments', 'about', 'more', 'read', 'view', 'click', 'here', 'also',
    'will', 'just', 'like', 'make', 'know', 'take', 'come', 'could',
    'been', 'have', 'from', 'with', 'this', 'that', 'what', 'when',
    'your', 'their', 'which', 'would', 'there', 'some', 'other', 'than',
    'then', 'them', 'these', 'only', 'over', 'such', 'into', 'year',
    'each', 'most', 'said', 'does', 'many', 'well', 'very', 'much',
    'should', 'even', 'still', 'while', 'after', 'before', 'being',
    'unde', 'care', 'sunt', 'este', 'pentru', 'prin', 'fost', 'poate',
    'despre', 'doar', 'toate', 'acum', 'foarte', 'astfel', 'unde',
  ]);

  const topTags = [...scores.entries()]
    .filter(([word]) => !stopWords.has(word) && word.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => `#${toPascalCase(word)}`);

  return ['#processedInfo', ...topTags];
}

module.exports = {
  extractTags
};
