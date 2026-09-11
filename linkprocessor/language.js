const { franc } = require('franc');

const ROMANIAN_INDICATORS = [
  'și', 'este', 'pentru', 'care', 'sunt', 'sau', 'acest', 'aceasta',
  'într', 'prin', 'din', 'lui', 'mai', 'fost', 'avea', 'fiind',
  'poate', 'despre', 'doar', 'toate', 'acum', 'foarte', 'astfel',
  'după', 'când', 'unde', 'cum', 'fără', 'între', 'asupra',
  'România', 'bucuresti', 'bucurești',
];

function detectLanguage(text, url) {
  if (!text || text.length < 5) {
    return urlHeuristic(url);
  }

  const detected = franc(text, { minLength: 10 });

  if (detected === 'ron') {
    return 'ro';
  }

  if (detected === 'eng') {
    return 'en';
  }

  if (hasRomanianWords(text)) {
    return 'ro';
  }

  if (url && urlHeuristic(url) === 'ro') {
    return 'ro';
  }

  return 'en';
}

function hasRomanianWords(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let roWordCount = 0;

  for (const word of words) {
    if (ROMANIAN_INDICATORS.some(indicator => word === indicator.toLowerCase() || word.includes(indicator.toLowerCase()))) {
      roWordCount++;
    }
  }

  return roWordCount >= 2;
}

function urlHeuristic(url) {
  if (!url) return 'en';
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.endsWith('.ro')) {
      return 'ro';
    }
  } catch {
    // Ignore
  }
  return 'en';
}

module.exports = {
  detectLanguage
};
