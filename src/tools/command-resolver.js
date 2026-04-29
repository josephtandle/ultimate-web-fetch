'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execFileAsync = promisify(execFile);
const pythonCache = new Map();

function pythonCandidates(envVar = 'WEBFETCH_PYTHON') {
  const configured = [
    { command: process.env[envVar], source: envVar },
    { command: process.env.WEBFETCH_PYTHON, source: 'WEBFETCH_PYTHON' },
  ].filter(item => item.command);
  const candidates = configured.map(({ command, source }) => ({ command, prefixArgs: [], source }));

  if (process.platform === 'win32') {
    candidates.push(
      { command: 'py', prefixArgs: ['-3.11'], source: 'py -3.11' },
      { command: 'py', prefixArgs: ['-3'], source: 'py -3' },
      { command: 'python', prefixArgs: [], source: 'python' },
      { command: 'python3', prefixArgs: [], source: 'python3' },
    );
  } else {
    candidates.push(
      { command: 'python3.11', prefixArgs: [], source: 'python3.11' },
      { command: 'python3', prefixArgs: [], source: 'python3' },
      { command: 'python', prefixArgs: [], source: 'python' },
    );
  }

  return dedupeCandidates(candidates);
}

function commandCandidates(envVar, names, extra = []) {
  const configured = process.env[envVar] ? [{ command: process.env[envVar], prefixArgs: [], source: envVar }] : [];
  return dedupeCandidates([
    ...configured,
    ...names.map(name => ({ command: name, prefixArgs: [], source: name })),
    ...extra,
  ]);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = `${candidate.command}\0${candidate.prefixArgs.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function findCommand(candidates, probeArgs, options = {}) {
  const errors = [];
  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate.command, [...candidate.prefixArgs, ...probeArgs], {
        timeout: options.timeout || 5000,
        maxBuffer: options.maxBuffer || 1024 * 1024,
      });
      return { ...candidate, ...result };
    } catch (err) {
      errors.push(`${candidate.source || candidate.command}: ${err.message}`);
    }
  }
  const error = new Error(`No working command found. Tried: ${candidates.map(c => c.source || c.command).join(', ')}`);
  error.attempts = errors;
  throw error;
}

async function resolvePython(envVar = 'WEBFETCH_PYTHON') {
  const cacheKey = `${envVar}:${process.env[envVar] || ''}:${process.env.WEBFETCH_PYTHON || ''}`;
  if (pythonCache.has(cacheKey)) return pythonCache.get(cacheKey);

  const resolved = await findCommand(pythonCandidates(envVar), ['-c', 'import sys; print(sys.executable)']);
  pythonCache.set(cacheKey, resolved);
  return resolved;
}

async function runPython(envVar, args, options = {}) {
  const resolved = await resolvePython(envVar);
  const result = await execFileAsync(resolved.command, [...resolved.prefixArgs, ...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  });
  return { ...result, python: resolved.stdout.trim() || resolved.command, source: resolved.source };
}

function homeDirDisplay(filePath) {
  return String(filePath || '').replace(os.homedir(), '~');
}

module.exports = {
  commandCandidates,
  execFileAsync,
  findCommand,
  homeDirDisplay,
  pythonCandidates,
  resolvePython,
  runPython,
};
