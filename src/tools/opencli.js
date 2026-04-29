'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);
const PYTHON = '/opt/homebrew/bin/python3.11';
const ADAPTERS_FILE = path.join(__dirname, '..', '..', 'config', 'opencli-adapters.json');
const TIMEOUT_MS = 30000;
const STALE_DAYS = 7;

function loadAdapters() {
  try {
    return JSON.parse(fs.readFileSync(ADAPTERS_FILE, 'utf8'));
  } catch {
    return { lastUpdated: null, adapters: [] };
  }
}

function getAdapterForDomain(domain) {
  const { adapters, lastUpdated } = loadAdapters();
  const stale = !lastUpdated || (Date.now() - new Date(lastUpdated).getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000;
  const match = adapters.find(a => domain.includes(a.site) || a.site.includes(domain));
  return { adapter: match?.adapter || null, stale };
}

async function runOpenCLI(url, goal, options = {}) {
  const { execFile: ef } = require('child_process');
  try {
    const { URL } = require('url');
    const domain = new URL(url).hostname;
    const { adapter, stale } = getAdapterForDomain(domain);

    if (!adapter) {
      return { success: false, error: `No OpenCLI adapter found for ${domain}`, tool: 'opencli' };
    }

    const warnings = stale ? ['OpenCLI adapter list may be stale — run `node src/index.js adapters` to refresh'] : [];

    const args = ['-m', 'opencli', adapter, url];
    if (goal) args.push('--goal', goal);

    const { stdout } = await execFileAsync(PYTHON, args, { timeout: options.timeout || TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 });
    let data;
    try { data = JSON.parse(stdout.trim()); } catch { data = stdout.trim(); }

    return { success: true, data, tool: 'opencli', url, warnings };
  } catch (err) {
    return { success: false, error: err.message, tool: 'opencli' };
  }
}

async function listAdapters() {
  try {
    const { stdout } = await execFileAsync(PYTHON, ['-m', 'opencli', 'list', '--json'], { timeout: 15000 });
    let raw;
    try { raw = JSON.parse(stdout.trim()); } catch { raw = []; }
    const adapters = Array.isArray(raw) ? raw.map(a => ({ site: a.site || a.name, adapter: a.id || a.name })) : [];
    const payload = { lastUpdated: new Date().toISOString(), adapters };
    fs.writeFileSync(ADAPTERS_FILE, JSON.stringify(payload, null, 2));
    return { success: true, adapters };
  } catch (err) {
    return { success: false, error: err.message, adapters: [] };
  }
}

async function checkInstalled() {
  try {
    await execFileAsync(PYTHON, ['-m', 'opencli', '--version'], { timeout: 5000 });
    return { installed: true };
  } catch (err) {
    // Also try pip show
    try {
      const { stdout } = await execFileAsync(PYTHON, ['-m', 'pip', 'show', 'opencli'], { timeout: 5000 });
      const versionLine = stdout.split('\n').find(l => l.startsWith('Version:'));
      return { installed: true, version: versionLine?.split(': ')[1]?.trim() };
    } catch {
      return { installed: false };
    }
  }
}

module.exports = { runOpenCLI, listAdapters, checkInstalled, getAdapterForDomain };
