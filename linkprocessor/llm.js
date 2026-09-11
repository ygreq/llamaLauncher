const { config } = require('./config');

let getLlmPortCallback = () => null;

function setLlmPortCallback(cb) {
  getLlmPortCallback = cb;
}

function getLlmBaseUrl() {
  const port = getLlmPortCallback();
  if (port) {
    return `http://127.0.0.1:${port}`;
  }
  return null;
}

async function chatCompletion(systemPrompt, userMessage, maxTokens = 2048) {
  const baseUrl = getLlmBaseUrl();
  if (!baseUrl) {
    console.error('  ✗ LLM is offline (no running model in LlamaLaunch).');
    return null;
  }

  const payload = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    stream: false,
  };

  const endpoints = [
    '/v1/chat/completions',
    '/api/chat'
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.llmTimeout);
      const url = `${baseUrl}${endpoint}`;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      clearTimeout(timeout);

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`  ⚠ LLM request to ${endpoint} failed (${response.status}): ${errText.slice(0, 100)}`);
        continue;
      }

      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content;

      if (!content && data?.message?.content) {
        content = data.message.content;
      }
      if (!content && data?.content) {
        content = data.content;
      }

      if (content) {
        return content.trim();
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`  ⚠ LLM request to ${endpoint} timed out`);
      } else {
        console.warn(`  ⚠ LLM request to ${endpoint} error: ${err.message}`);
      }
    }
  }

  console.error('  ✗ All LLM completion endpoints failed.');
  return null;
}

async function isLlmAvailable() {
  const baseUrl = getLlmBaseUrl();
  if (!baseUrl) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      if (data && (data.status === 'ok' || data.status === 'success' || data.slots_idle !== undefined)) {
        return true;
      }
    }
  } catch {
    // Ignore error
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      return true;
    }
  } catch {
    // Ignore
  }

  return false;
}

const SYSTEM_PROMPT = `You are an expert Knowledge Management assistant for Logseq. You analyze articles and video transcripts to produce concise, high-signal, factual knowledge entries.

RULES:
- Do NOT output any thinking, reasoning, or <|think|> blocks. Do not use any thinking tags.
- Language Policy:
  * If the source content is in Romanian, write your output in Romanian.
  * If the source content is in English, write your output in English.
  * If the source content is in any other language, translate and write your output in English.
- No meta-talk or filler: Never say "This article discusses..." or "The author explains...". State facts directly.
- Never invent information not present in the provided text.
- Follow the EXACT output format requested without adding any extra headers or text.`;

async function llmProcess({ title, description, articleContent, providedInfo, siteName, url }) {
  const contentSnippet = Array.isArray(articleContent)
    ? articleContent.join('\n\n').slice(0, 15000)
    : String(articleContent || '').slice(0, 15000);

  const categoryInstructions = Object.entries(config.categories || {})
    .map(([tag, keywords]) => `- Apply tag "${tag}" if the article contains topics or keywords related to: ${keywords.join(', ')}`)
    .join('\n');

  const userMessage = `Process this article/content and provide:
1. TAGS: Generate 5 to 7 highly relevant, specific PascalCase tags (no #, no numbers, no spaces). Capture the core technologies, concepts, and domain.
   You MUST check if the article matches any of the following categories, and if so, append their specific tag:
${categoryInstructions}
2. SUMMARY: Provide exactly 3 informative, high-signal bullet points so that reading them gives a complete understanding of the content and its conclusion:
   - SUMMARY1 (Core Premise / TLDR): What core problem, topic, or thesis does this address?
   - SUMMARY2 (Key Insights & Mechanism): What are the essential technical details, methodology, steps, or evidence?
   - SUMMARY3 (Conclusion & Takeaway): What is the author's final conclusion, practical recommendation, or outcome? (Omit only if the content is extremely brief).
   Each bullet point must be a distinct, complete, informative sentence without repeating information or using placeholders.

---
TITLE: ${title || '(no title)'}
SOURCE: ${siteName}
URL: ${url}
${providedInfo ? `USER NOTE: ${providedInfo}` : ''}
META DESCRIPTION: ${description || '(none)'}
CONTENT / TRANSCRIPT:
${contentSnippet || '(no content extracted)'}
---

Respond in this EXACT format (no extra text, do NOT declare language):
TAGS: TagOne, TagTwo, TagThree, TagFour, TagFive
SUMMARY1: First informative summary point (core premise/TLDR).
SUMMARY2: Second informative summary point (key details/insights).
SUMMARY3: Third informative summary point (conclusion/takeaway).`;

  const response = await chatCompletion(SYSTEM_PROMPT, userMessage, 2048);
  if (!response) return null;

  try {
    return parseLlmResponse(response, { title, description });
  } catch (err) {
    console.warn(`  ⚠ Failed to parse LLM response: ${err.message}`);
    return null;
  }
}

function parseLlmResponse(text, contextInfo = {}) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const tags = [];
  const summaryPoints = [];

  for (const line of lines) {
    if (line.startsWith('TAGS:')) {
      const rawTags = line.replace('TAGS:', '').trim();
      const parsedTags = rawTags
        .split(/[,;]+/)
        .map(t => t.trim().replace(/^#/, ''))
        .filter(t => t.length > 1)
        .map(t => {
          return t.split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
        });
      tags.push(...parsedTags.slice(0, 7));
    } else if (line.match(/^SUMMARY\d?:/i)) {
      const point = line.replace(/^SUMMARY\d?:/i, '').trim();
      if (point.length > 5) {
        summaryPoints.push(point);
      }
    } else if (line.startsWith('- ') && summaryPoints.length < 3) {
      const point = line.replace(/^[-\u2022*]\s*/, '').trim();
      if (point.length > 10) {
        summaryPoints.push(point);
      }
    }
  }

  // Filter out any placeholders or non-informative lines
  const filteredPoints = summaryPoints.filter(p => {
    const lp = p.toLowerCase();
    return !lp.includes('no article content') && 
           !lp.includes('no content') && 
           !lp.includes('no summary') && 
           !lp.includes('cannot be generated') &&
           !lp.includes('unable to summarize') &&
           !lp.includes('placeholder');
  });

  // Fallback to meta description or title TLDR if no valid summary points were generated
  if (filteredPoints.length === 0) {
    const desc = contextInfo.description || '';
    const cleanDesc = desc && desc.trim() !== '(none)' ? desc.trim() : '';
    if (cleanDesc && cleanDesc.length > 10) {
      filteredPoints.push(cleanDesc);
    } else {
      const t = contextInfo.title || '';
      filteredPoints.push(`Resource: ${t}`);
    }
  }

  if (tags.length === 0) tags.push('Article');

  const formattedTags = [
    '#processedInfo',
    ...tags.slice(0, 7).map(t => t.startsWith('#') ? t : `#${t}`)
  ];

  return {
    tags: formattedTags,
    summaryPoints: filteredPoints.slice(0, 3),
  };
}

module.exports = {
  setLlmPortCallback,
  isLlmAvailable,
  llmProcess,
  parseLlmResponse
};
