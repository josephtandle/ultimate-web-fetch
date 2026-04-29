'use strict';

const path = require('path');
const { resolveBrowserRequest } = require('../browser-route');
const { runPython } = require('./command-resolver');

const RUNNER = path.join(__dirname, '_browser_use_runner.py');
const TIMEOUT_MS = 120000;

async function runBrowserUse(url, goal, options = {}) {
  const timeout = options.timeout || TIMEOUT_MS;
  const request = resolveBrowserRequest({
    caller: 'webfetch',
    intent: options.intent || 'agent_research',
    url,
    browser: options.browser || null,
    reason: goal || 'browser-use',
  });
  const browserLane = request.lane;

  const args = [RUNNER, '--url', url, '--goal', goal, '--timeout', String(Math.floor(timeout / 1000)), '--browser', browserLane];

  try {
    const { stdout, stderr } = await runPython('BROWSER_USE_PYTHON', args, {
      timeout: timeout + 5000, // give Python a few extra seconds beyond its internal timeout
      maxBuffer: 10 * 1024 * 1024,
    });

    let result;
    try {
      result = JSON.parse(stdout.trim());
    } catch {
      return { success: false, error: `Non-JSON output: ${stdout.slice(0, 200)}`, tool: 'browser-use' };
    }

    if (stderr && !result.success) {
      result.stderr = stderr.slice(0, 500);
    }

    return result;
  } catch (err) {
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return { success: false, error: 'Output too large (>10MB)', tool: 'browser-use' };
    }
    return { success: false, error: err.message, tool: 'browser-use' };
  }
}

async function checkInstalled() {
  try {
    const script = 'import importlib.metadata as m; import browser_use; import langchain_openai; print(m.version("browser-use"))';
    const { stdout, python, source } = await runPython('BROWSER_USE_PYTHON', ['-c', script], { timeout: 8000 });
    const version = stdout.trim() || 'unknown';
    return { installed: true, version, python, source };
  } catch (err) {
    return {
      installed: false,
      python: null,
      install: 'python -m pip install browser-use langchain-openai',
      error: err.message,
    };
  }
}

module.exports = { runBrowserUse, checkInstalled };
