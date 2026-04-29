'use strict';

const { URL } = require('url');

const robotsCache = new Map(); // domain -> { allowed: boolean, fetchedAt: number }
const domainLastFetch = new Map(); // domain -> timestamp
const ROBOTS_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_DELAY_MS = 1000;
const UA = 'Ultimate-Web-Fetch/1.0 (+https://github.com/josephtandle/ultimate-web-fetch)';

function getDomain(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr;
  }
}

async function fetchRobotsTxt(domain) {
  const cached = robotsCache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL) return cached;

  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const entry = { rules: [], fetchedAt: Date.now() };
      robotsCache.set(domain, entry);
      return entry;
    }
    const text = await res.text();
    const rules = parseRobots(text);
    const entry = { rules, fetchedAt: Date.now() };
    robotsCache.set(domain, entry);
    return entry;
  } catch {
    const entry = { rules: [], fetchedAt: Date.now() };
    robotsCache.set(domain, entry);
    return entry;
  }
}

function parseRobots(text) {
  const disallowed = [];
  let inUserAgentAll = false;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.toLowerCase().startsWith('user-agent:')) {
      const agent = l.slice(11).trim();
      inUserAgentAll = agent === '*';
    }
    if (inUserAgentAll && l.toLowerCase().startsWith('disallow:')) {
      const path = l.slice(9).trim();
      if (path) disallowed.push(path);
    }
  }
  return disallowed;
}

function isDisallowed(rules, urlStr) {
  try {
    const pathname = new URL(urlStr).pathname;
    return rules.some(rule => pathname.startsWith(rule));
  } catch {
    return false;
  }
}

async function check(urlStr, { ignoreRobots = false } = {}) {
  if (ignoreRobots) return { allowed: true };
  const domain = getDomain(urlStr);
  const robots = await fetchRobotsTxt(domain);
  const allowed = !isDisallowed(robots.rules, urlStr);
  return { allowed, domain };
}

async function applyDelay(urlStr, delayMs = DEFAULT_DELAY_MS) {
  const domain = getDomain(urlStr);
  const last = domainLastFetch.get(domain);
  if (last) {
    const elapsed = Date.now() - last;
    if (elapsed < delayMs) {
      await new Promise(r => setTimeout(r, delayMs - elapsed));
    }
  }
  domainLastFetch.set(domain, Date.now());
}

module.exports = { check, applyDelay, UA, getDomain };
