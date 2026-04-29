'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execFileAsync = promisify(execFile);

// shot-scraper is a Python CLI tool by Simon Willison, built on Playwright.
// It provides CSS selector targeting, JS injection, retina output, and YAML batch.
// Install: pip install shot-scraper && shot-scraper install
const SHOT_SCRAPER_BIN = process.env.SHOT_SCRAPER_BIN
  || '/opt/homebrew/bin/shot-scraper'
  || path.join(os.homedir(), 'Library', 'Python', '3.9', 'bin', 'shot-scraper');

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'data', 'screenshots');

async function runShotScraper(args, options = {}) {
  const timeout = options.timeout || 60000;
  try {
    const { stdout, stderr } = await execFileAsync(SHOT_SCRAPER_BIN, args, { timeout });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr || '' };
  }
}

async function screenshot(url, options = {}) {
  const {
    output = null,
    selector = null,
    fullPage = false,
    retina = false,
    javascript = null,
    width = 1440,
    height = 900,
    waitFor = null,
    quality = null,
  } = options;

  const outputPath = output || path.join(DEFAULT_OUTPUT_DIR, `screenshot-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // shot-scraper shot <url> [options]
  const args = ['shot', url, '-o', outputPath];

  if (selector) args.push('-s', selector);
  if (retina) args.push('--retina');
  if (javascript) args.push('-j', javascript);
  if (width) args.push('-w', String(width));
  // Not specifying -h defaults to full page height; specifying height crops to viewport
  if (!fullPage && height) args.push('-h', String(height));
  if (quality != null) args.push('--quality', String(quality));

  const result = await runShotScraper(args, options);

  if (!result.success) {
    return { success: false, error: result.error, tool: 'shot-scraper', url };
  }

  return {
    success: true,
    path: outputPath,
    url,
    tool: 'shot-scraper',
    selector: selector || null,
    fullPage,
    retina,
  };
}

// Batch screenshot from a YAML file (shot-scraper multi format)
async function screenshotBatch(shotsYamlPath, options = {}) {
  if (!fs.existsSync(shotsYamlPath)) {
    return { success: false, error: `shots file not found: ${shotsYamlPath}`, tool: 'shot-scraper' };
  }

  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });

  const args = ['multi', shotsYamlPath];
  const result = await runShotScraper(args, { ...options, timeout: 300000 });

  if (!result.success) {
    return { success: false, error: result.error, tool: 'shot-scraper' };
  }

  return {
    success: true,
    outputDir,
    stdout: result.stdout,
    tool: 'shot-scraper',
  };
}

// Capture every section of a page via multiple CSS selectors
async function screenshotSections(url, sections, outputDir, options = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];

  // Always take a full-page first
  const fullPagePath = path.join(outputDir, '00-full-page.png');
  const fullPageResult = await screenshot(url, {
    output: fullPagePath,
    fullPage: true,
    retina: options.retina || false,
    javascript: options.javascript || null,
    width: options.width || 1440,
  });
  results.push({ label: 'full-page', ...fullPageResult });

  // Then per-section selector crops
  for (const [i, section] of sections.entries()) {
    const label = section.label || `section-${String(i + 1).padStart(2, '0')}`;
    const outPath = path.join(outputDir, `${String(i + 1).padStart(2, '0')}-${label}.png`);
    const r = await screenshot(url, {
      output: outPath,
      selector: section.selector,
      retina: options.retina || false,
      javascript: options.javascript || null,
      width: options.width || 1440,
    });
    results.push({ label, ...r });
  }

  const succeeded = results.filter(r => r.success).length;
  return { success: true, results, succeeded, failed: results.length - succeeded, outputDir, tool: 'shot-scraper' };
}

async function checkInstalled() {
  try {
    const { stdout } = await execFileAsync(SHOT_SCRAPER_BIN, ['--version'], { timeout: 5000 });
    return { installed: true, version: stdout.trim() };
  } catch {
    return { installed: false, version: null };
  }
}

module.exports = { screenshot, screenshotBatch, screenshotSections, checkInstalled, SHOT_SCRAPER_BIN };
