'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { resolveBrowserRequest } = require('../browser-route');

const execFileAsync = promisify(execFile);
const PYTHON = '/opt/homebrew/bin/python3.11';
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
    const { stdout, stderr } = await execFileAsync(PYTHON, args, {
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
    const { stdout } = await execFileAsync(PYTHON, ['-m', 'pip', 'show', 'browser-use'], { timeout: 8000 });
    const vLine = stdout.split('\n').find(l => l.startsWith('Version:'));
    const version = vLine ? vLine.split(': ')[1].trim() : 'unknown';
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

module.exports = { runBrowserUse, checkInstalled };
