'use strict';

/**
 * WebFetch programmatic API.
 * Require-safe — no CLI side effects, no process.argv parsing.
 *
 * const { fetchUrl, screenshot, pdf, extractSelector, batchFetch } = require('./api');
 */

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { runScrapling, checkInstalled: scrapling_check } = require('./tools/scrapling');
const { runPlaywright, takeScreenshot, savePdf, extractSelector: playwrightExtract, checkInstalled: playwright_check } = require('./tools/playwright');
const { runOpenCLI, checkInstalled: opencli_check } = require('./tools/opencli');
const { runBrowserUse, checkInstalled: browseruse_check } = require('./tools/browser-use');
const shotScraper = require('./tools/shot-scraper');
const ytDlp = require('./tools/yt-dlp');
const { selectTool } = require('./router');
const { extractWithGoal } = require('./lib/llm-extract');
const { format } = require('./formatter');
const cache = require('./cache');
const politeness = require('./politeness');

async function getInstalled() {
  const [sc, pw, oc, bu, yd] = await Promise.all([
    scrapling_check(), playwright_check(), opencli_check(), browseruse_check(), ytDlp.checkInstalled(),
  ]);
  return {
    scrapling: sc.installed,
    playwright: pw.installed,
    opencli: oc.installed,
    browserUse: bu.installed,
    ytDlp: yd.installed,
  };
}

async function runTool(tool, url, goal, options) {
  switch (tool) {
    case 'scrapling': return runScrapling(url, goal, options);
    case 'playwright': return runPlaywright(url, goal, options);
    case 'opencli': return runOpenCLI(url, goal, options);
    case 'browser-use': return runBrowserUse(url, goal, options);
    default: throw new Error(`Unknown tool: ${tool}`);
  }
}

async function fetchUrl(url, options = {}) {
  const {
    goal = null,
    tool: forcedTool = null,
    format: fmt = 'markdown',
    browser = null,
    noCache = false,
    cacheTtlMs = null,
    ignoreRobots = false,
    delayMs = 1000,
    dryRun = false,
  } = options;

  // Politeness check
  if (!ignoreRobots) {
    const { allowed, domain } = await politeness.check(url, { ignoreRobots });
    if (!allowed) {
      return { success: false, error: `robots.txt disallows access to ${url}. Use --ignore-robots to override.`, tool: null, url };
    }
  }

  // Cache check
  if (!noCache) {
    const cached = cache.get(url, goal, fmt);
    if (cached) {
      return { success: true, data: cached.data, tool: cached.tool, url, cached: true, format: fmt };
    }
  }

  const installed = await getInstalled();
  const tool = forcedTool || selectTool(url, goal, { installed });

  if (dryRun) {
    const { explainChoice } = require('./router');
    return { dryRun: true, tool, reason: explainChoice(url, goal, { installed, forcedTool }), installed };
  }

  // Apply polite delay
  await politeness.applyDelay(url, delayMs);

  const toolOptions = { browser, timeout: options.timeout };
  let result = await runTool(tool, url, goal, toolOptions);

  // Fallback to playwright if primary failed
  if (!result.success && tool !== 'playwright') {
    console.error(`[webfetch] ${tool} failed (${result.error}), falling back to playwright`);
    result = await runPlaywright(url, goal, toolOptions);
  }

  if (!result.success) {
    return result;
  }

  // Goal-based LLM extraction
  let finalData;
  if (goal && result.rawHtml) {
    try {
      finalData = await extractWithGoal(result.data || result.rawHtml, goal, url);
    } catch (err) {
      finalData = format(result.rawHtml, fmt, { url, tool: result.tool, ...result.meta });
    }
  } else {
    finalData = result.rawHtml
      ? format(result.rawHtml, fmt, { url, tool: result.tool, ...result.meta })
      : (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
  }

  // Cache result
  if (!noCache) {
    cache.set(url, goal, fmt, finalData, result.tool, cacheTtlMs);
  }

  return {
    success: true,
    data: finalData,
    tool: result.tool,
    url,
    cached: false,
    format: fmt,
    warnings: result.warnings,
  };
}

async function screenshot(url, options = {}) {
  const {
    browser = null,
    fullPage = false,
    output = null,
    tool = null,
    selector = null,
    retina = false,
    javascript = null,
    width = null,
    waitFor = null,
  } = options;

  if (tool === 'shot-scraper' || selector || retina) {
    return shotScraper.screenshot(url, { output, selector, fullPage, retina, javascript, width, waitFor });
  }

  const result = await takeScreenshot(url, { browser, fullPage, screenshotPath: output });
  if (!result.success) return result;
  return { success: true, path: result.screenshotPath, url, tool: result.tool };
}

async function screenshotBatch(shotsYamlPath, options = {}) {
  return shotScraper.screenshotBatch(shotsYamlPath, options);
}

async function screenshotSections(url, sections, outputDir, options = {}) {
  return shotScraper.screenshotSections(url, sections, outputDir, options);
}

async function pdf(url, options = {}) {
  const { browser = null, output = null } = options;
  const result = await savePdf(url, { browser, pdfPath: output });
  return result;
}

async function downloadMedia(url, options = {}) {
  return ytDlp.downloadMedia(url, options);
}

async function extractSelector(url, selector, options = {}) {
  return playwrightExtract(url, selector, options);
}

async function batchFetch(manifest, options = {}) {
  const results = [];
  for (const item of manifest) {
    const result = await fetchUrl(item.url, { goal: item.goal, format: item.format, ...options });
    results.push({ ...result, inputUrl: item.url });
  }
  const succeeded = results.filter(r => r.success).length;
  return { results, succeeded, failed: results.length - succeeded };
}

module.exports = { fetchUrl, screenshot, screenshotBatch, screenshotSections, pdf, downloadMedia, extractSelector, batchFetch, getInstalled };
