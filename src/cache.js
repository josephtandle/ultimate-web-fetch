'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cacheDir } = require('./paths');

const CACHE_DIR = cacheDir();
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_TTL_WITH_GOAL = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TTL_WITHOUT_GOAL = 5 * 60 * 1000; // 5 minutes

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(url, goal, format) {
  return crypto.createHash('sha256').update(`${url}||${goal || ''}||${format || 'markdown'}`).digest('hex');
}

function cacheFile(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function get(url, goal, format) {
  ensureCacheDir();
  const file = cacheFile(cacheKey(url, goal, format));
  if (!fs.existsSync(file)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() > entry.expiresAt) {
      fs.unlinkSync(file);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function set(url, goal, format, data, tool, ttlMs) {
  ensureCacheDir();
  const effectiveTtl = ttlMs != null ? ttlMs : (goal ? DEFAULT_TTL_WITH_GOAL : DEFAULT_TTL_WITHOUT_GOAL);
  const now = Date.now();
  const entry = {
    url,
    goal: goal || null,
    format: format || 'markdown',
    data,
    fetchedAt: now,
    expiresAt: now + effectiveTtl,
    tool,
    size: Buffer.byteLength(typeof data === 'string' ? data : JSON.stringify(data), 'utf8'),
  };
  const key = cacheKey(url, goal, format);
  fs.writeFileSync(cacheFile(key), JSON.stringify(entry, null, 2));
  evictIfNeeded();
}

function evictIfNeeded() {
  try {
    const files = fs.readdirSync(CACHE_DIR).map(f => {
      const full = path.join(CACHE_DIR, f);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs, size: stat.size };
    }).sort((a, b) => a.mtime - b.mtime);

    let total = files.reduce((s, f) => s + f.size, 0);
    for (const file of files) {
      if (total <= MAX_CACHE_BYTES) break;
      fs.unlinkSync(file.path);
      total -= file.size;
    }
  } catch { /* best effort */ }
}

function list() {
  ensureCacheDir();
  const now = Date.now();
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
        const ageMs = now - entry.fetchedAt;
        const expiresInMs = entry.expiresAt - now;
        return {
          url: entry.url,
          goal: entry.goal ? entry.goal.slice(0, 60) : null,
          tool: entry.tool,
          ageSeconds: Math.round(ageMs / 1000),
          expiresInSeconds: Math.round(expiresInMs / 1000),
          sizeBytes: entry.size,
          expired: expiresInMs < 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.ageSeconds - b.ageSeconds);
}

function clear(domain) {
  ensureCacheDir();
  let count = 0;
  for (const f of fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))) {
    const full = path.join(CACHE_DIR, f);
    try {
      if (domain) {
        const entry = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (!entry.url.includes(domain)) continue;
      }
      fs.unlinkSync(full);
      count++;
    } catch { /* skip */ }
  }
  return count;
}

module.exports = { get, set, list, clear, cacheKey };
