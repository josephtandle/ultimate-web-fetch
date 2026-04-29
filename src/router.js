'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ADAPTERS_FILE = path.join(__dirname, '..', 'config', 'opencli-adapters.json');
const STALE_DAYS = 7;
const PREFERRED_COMMAND_NAMES = new Set(['read', 'article', 'product', 'item', 'video', 'detail', 'content', 'summary', 'news', 'offer']);
const SECONDARY_COMMAND_NAMES = new Set(['comments', 'comment', 'like', 'unlike', 'download', 'assets', 'subscribe', 'unsubscribe']);

// STATIC signals — page content doesn't need JS to be present
const STATIC_GOAL = /\b(extract|scrape|read|get\s+text|get\s+content|parse|fetch\s+data|download\s+page)\b/i;
const INTERACTION_GOAL = /\b(click|fill|login|sign\s*in|submit|navigate|interact|scroll|type|select|press|hover|drag|upload)\b/i;
const STATIC_DOMAINS = /\b(wikipedia\.org|medium\.com|substack\.com|\.gov|\.edu|news|blog|docs?\.)\b/i;
const SPA_DOMAINS = /\b(twitter\.com|x\.com|instagram\.com|linkedin\.com|facebook\.com|app\.|dashboard\.|admin\.|notion\.so)\b/i;

// AUTONOMOUS signals — multi-step, exploratory tasks
const AUTONOMOUS_GOAL = /\b(figure\s+out|find\s+and\s+then|browse\s+until|research|compare|investigate|explore|search.*and\s+(visit|click|open)|find.*visit|visit\s+each|go\s+to\s+each|compile|gather\s+from|collect\s+from)\b/i;

function getDomain(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr;
  }
}

function getOpenCLIAdapter(domain) {
  try {
    const data = JSON.parse(fs.readFileSync(ADAPTERS_FILE, 'utf8'));
    const stale = !data.lastUpdated || (Date.now() - new Date(data.lastUpdated).getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000;
    const match = (data.adapters || []).filter(a => {
      if (!a.acceptsUrl || a.command === 'web/read') return false;
      if (a.domain && (domain === a.domain || domain.endsWith(`.${a.domain}`))) return true;
      return a.site && domain.includes(a.site);
    }).sort((a, b) => adapterPriority(a) - adapterPriority(b))[0];
    return { adapter: match?.adapter || null, stale };
  } catch {
    return { adapter: null, stale: true };
  }
}

function adapterPriority(adapter) {
  const name = adapter.name || adapter.command?.split('/').pop() || '';
  if (PREFERRED_COMMAND_NAMES.has(name)) return 0;
  if (!adapter.browser) return 20;
  if (SECONDARY_COMMAND_NAMES.has(name)) return 80;
  return 50;
}

function scoreStatic(url, goal) {
  const g = goal || '';
  const d = getDomain(url);
  let score = 0;

  if (STATIC_GOAL.test(g)) score += 2;
  if (!INTERACTION_GOAL.test(g)) score += 2;
  if (STATIC_DOMAINS.test(d)) score += 1;
  if (/\.(html?|txt|md)($|\?)/.test(url) || /^\/?$/.test(new URL(url).pathname || '/')) score += 1;

  return score;
}

function scoreDynamic(url, goal) {
  const g = goal || '';
  const d = getDomain(url);
  let score = 0;

  if (INTERACTION_GOAL.test(g)) score += 3;
  if (SPA_DOMAINS.test(d)) score += 2;
  if (/\/(app|dashboard|admin)\//.test(url)) score += 1;

  return score;
}

function isAutonomous(goal) {
  if (!goal) return false;
  const sentences = goal.split(/[.!?]\s+|\n/).filter(s => s.trim().length > 0).length;
  return sentences >= 2 || (AUTONOMOUS_GOAL.test(goal) && goal.length > 80);
}

function selectTool(url, goal, { installed = {}, forcedTool } = {}) {
  // 1. Forced tool
  if (forcedTool) {
    if (!installed[forcedTool] && forcedTool !== 'playwright') {
      throw new Error(`Tool '${forcedTool}' is not installed. Run: node src/index.js preflight`);
    }
    return forcedTool;
  }

  const domain = getDomain(url);

  // 2. OpenCLI adapter
  if (installed.opencli) {
    const { adapter } = getOpenCLIAdapter(domain);
    if (adapter) return 'opencli';
  }

  // 3. Autonomous task check FIRST — multi-step goals override static scoring
  if (isAutonomous(goal) && installed.browserUse) {
    return 'browser-use';
  }

  // 4. Static vs Dynamic scoring
  const staticScore = scoreStatic(url, goal);
  const dynamicScore = scoreDynamic(url, goal);

  if (staticScore > dynamicScore && installed.scrapling) {
    return 'scrapling';
  }

  // 5. Default
  return 'playwright';
}

function explainChoice(url, goal, { installed = {}, forcedTool } = {}) {
  if (forcedTool) return `Forced by --tool flag: ${forcedTool}`;

  const domain = getDomain(url);
  const parts = [];

  if (installed.opencli) {
    const { adapter } = getOpenCLIAdapter(domain);
    if (adapter) return `OpenCLI adapter '${adapter.command}' found for ${domain} — deterministic, zero runtime tokens`;
  }

  if (isAutonomous(goal) && installed.browserUse) {
    return 'Goal is multi-step/exploratory → browser-use (AI-driven autonomous browsing)';
  }

  const staticScore = scoreStatic(url, goal);
  const dynamicScore = scoreDynamic(url, goal);

  if (staticScore > dynamicScore && installed.scrapling) {
    parts.push(`static score (${staticScore}) > dynamic score (${dynamicScore})`);
    parts.push('scrapling chosen: fast, no JS rendering needed');
    return parts.join(' | ');
  }

  return `Playwright fallback: dynamic score (${dynamicScore}) ≥ static (${staticScore}), or other tools not installed`;
}

module.exports = { selectTool, explainChoice, getDomain };
