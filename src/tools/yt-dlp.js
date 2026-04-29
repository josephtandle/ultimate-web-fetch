'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execFileAsync = promisify(execFile);

const YT_DLP_BIN = process.env.YT_DLP_BIN || 'yt-dlp';

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), 'Downloads', 'webfetch-media');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

async function runYtDlp(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(YT_DLP_BIN, args, {
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { success: true, stdout: stdout.trim(), stderr: redact(stderr.trim()) };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stdout: err.stdout || '',
      stderr: redact(err.stderr || ''),
    };
  }
}

function redact(text) {
  return String(text || '')
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~')
    .replace(/(Authorization|Cookie|X-[A-Za-z-]*Token):\s*[^\s]+/gi, '$1: [redacted]');
}

function buildOutputTemplate(outputDir, template) {
  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, template || '%(title).120B-%(id)s.%(ext)s');
}

async function downloadMedia(url, options = {}) {
  const {
    outputDir = DEFAULT_OUTPUT_DIR,
    outputTemplate = null,
    audioOnly = false,
    subtitles = false,
    cookiesFromBrowser = null,
    allowBrowserCookies = false,
    format = null,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  const args = [
    '--no-playlist',
    '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', buildOutputTemplate(outputDir, outputTemplate),
  ];

  if (audioOnly) args.push('-x', '--audio-format', 'mp3');
  if (subtitles) args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'all', '--convert-subs', 'srt');
  if (cookiesFromBrowser) {
    if (!allowBrowserCookies) {
      return {
        success: false,
        error: 'Browser cookies require explicit opt-in. Pass allowBrowserCookies: true in the API or --allow-browser-cookies in the CLI, and only use it for content you are authorized to access.',
        tool: 'yt-dlp',
        url,
      };
    }
    args.push('--cookies-from-browser', cookiesFromBrowser);
  }
  if (format) args.push('-f', format);

  args.push(url);

  const result = await runYtDlp(args, { timeout });
  if (!result.success) {
    return { success: false, error: result.error, stderr: result.stderr, tool: 'yt-dlp', url };
  }

  const lines = result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
  return {
    success: true,
    path: lines[lines.length - 1] || null,
    files: lines,
    tool: 'yt-dlp',
    url,
    stderr: result.stderr,
  };
}

async function checkInstalled() {
  try {
    const { stdout } = await execFileAsync(YT_DLP_BIN, ['--version'], { timeout: 5000 });
    return { installed: true, version: stdout.trim(), bin: YT_DLP_BIN };
  } catch {
    return { installed: false, version: null, bin: YT_DLP_BIN };
  }
}

module.exports = { downloadMedia, checkInstalled, YT_DLP_BIN, DEFAULT_OUTPUT_DIR };
