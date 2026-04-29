'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);
const ADAPTERS_FILE = path.join(__dirname, '..', '..', 'config', 'opencli-adapters.json');
const TIMEOUT_MS = 30000;
const STALE_DAYS = 7;
const URL_ARG_NAMES = new Set(['url', 'input', 'link', 'href']);
const PREFERRED_COMMAND_NAMES = new Set(['read', 'article', 'product', 'item', 'video', 'detail', 'content', 'summary', 'news', 'offer']);
const SECONDARY_COMMAND_NAMES = new Set(['comments', 'comment', 'like', 'unlike', 'download', 'assets', 'subscribe', 'unsubscribe']);

function getOpenCLICommand() {
  if (process.env.OPENCLI_BIN) return { command: process.env.OPENCLI_BIN, prefixArgs: [] };

  try {
    const packagePath = require.resolve('@jackwener/opencli/package.json');
    const packageDir = path.dirname(packagePath);
    const { bin } = require(packagePath);
    const binPath = path.join(packageDir, typeof bin === 'string' ? bin : bin.opencli);
    return { command: process.execPath, prefixArgs: [binPath] };
  } catch {
    return { command: 'opencli', prefixArgs: [] };
  }
}

async function runCommand(args, options = {}) {
  const { command, prefixArgs } = getOpenCLICommand();
  return execFileAsync(command, [...prefixArgs, ...args], options);
}

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
  const match = adapters.find(a => {
    if (!a.acceptsUrl) return false;
    if (a.domain && (domain === a.domain || domain.endsWith(`.${a.domain}`))) return true;
    return a.site && domain.includes(a.site);
  }) || adapters.find(a => a.command === 'web/read');
  return { adapter: match?.adapter || null, stale };
}

function adapterPriority(adapter) {
  const name = adapter.name || adapter.command?.split('/').pop() || '';
  if (adapter.command === 'web/read') return 90;
  if (PREFERRED_COMMAND_NAMES.has(name)) return 0;
  if (!adapter.browser) return 20;
  if (SECONDARY_COMMAND_NAMES.has(name)) return 80;
  return 50;
}

async function runOpenCLI(url, goal, options = {}) {
  try {
    const { URL } = require('url');
    const domain = new URL(url).hostname;
    const { adapter, stale } = getAdapterForDomain(domain);

    if (!adapter) {
      return { success: false, error: `No OpenCLI adapter found for ${domain}`, tool: 'opencli' };
    }

    const warnings = stale ? ['OpenCLI adapter list may be stale — run `node src/index.js adapters` to refresh'] : [];
    if (goal) warnings.push('OpenCLI adapters do not accept arbitrary extraction goals; goal was ignored.');

    const [site, command] = adapter.command.split('/');
    const args = [site, command];
    if (adapter.urlArg?.positional) {
      args.push(url);
    } else {
      args.push(`--${adapter.urlArg?.name || 'url'}`, url);
    }
    if (adapter.command === 'web/read') {
      args.push('--stdout', 'true', '--download-images', 'false');
    }
    args.push('-f', 'json');

    const { stdout } = await runCommand(args, { timeout: options.timeout || TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 });
    let data;
    try { data = JSON.parse(stdout.trim()); } catch { data = stdout.trim(); }

    return { success: true, data, tool: 'opencli', url, warnings };
  } catch (err) {
    return { success: false, error: err.message, tool: 'opencli' };
  }
}

async function listAdapters() {
  try {
    const { stdout } = await runCommand(['list', '--json'], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
    let raw;
    try { raw = JSON.parse(stdout.trim()); } catch { raw = []; }
    const adapters = Array.isArray(raw) ? raw.map(a => {
      const urlArg = (a.args || []).find(arg => URL_ARG_NAMES.has(arg.name));
      return {
        site: a.site || a.name,
        command: a.command,
        adapter: { command: a.command, urlArg: urlArg ? { name: urlArg.name, positional: Boolean(urlArg.positional) } : null },
        name: a.name,
        domain: a.domain || null,
        browser: Boolean(a.browser),
        acceptsUrl: Boolean(urlArg),
      };
    }).sort((a, b) => adapterPriority(a) - adapterPriority(b)) : [];
    const payload = { lastUpdated: new Date().toISOString(), adapters };
    fs.writeFileSync(ADAPTERS_FILE, JSON.stringify(payload, null, 2));
    return { success: true, adapters };
  } catch (err) {
    return { success: false, error: err.message, adapters: [] };
  }
}

async function checkInstalled() {
  try {
    const { stdout } = await runCommand(['--version'], { timeout: 5000 });
    return { installed: true, version: stdout.trim() };
  } catch (err) {
    return { installed: false };
  }
}

module.exports = { runOpenCLI, listAdapters, checkInstalled, getAdapterForDomain };
