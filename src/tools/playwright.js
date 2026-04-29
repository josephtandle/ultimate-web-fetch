'use strict';

const { chromium } = require('playwright');
const { resolveBrowserRequest, assertLaneReady } = require('../browser-route');

const TIMEOUT_MS = 60000;
const AUTH_SIGNALS = /\b(login|auth|sign.?in|session|my account|as me|authenticated|logged.?in|password|credential)\b/i;
const INTERACTION_SIGNALS = /\b(click|fill|submit|type|select|scroll|interact|navigate to|go to|press|hover)\b/i;

function needsAgentLane(goal) {
  if (!goal) return false;
  return AUTH_SIGNALS.test(goal);
}

async function tryConnectCDP(ports) {
  for (const port of ports) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${port}`, { timeout: 3000 }); // browser-route: allow
      return { browser, port, connected: true };
    } catch {
      // try next port
    }
  }
  return null;
}

function inferIntent(goal, options = {}) {
  if (options.intent) return options.intent;
  if (options.pdf || options.screenshot) return 'agent_qa';
  if (needsAgentLane(goal)) return 'auth_user_visible';
  if (goal && INTERACTION_SIGNALS.test(goal)) return 'agent_research';
  return 'anonymous_scrape';
}

async function resolvePlaywrightLane(url, goal, options = {}) {
  const request = resolveBrowserRequest({
    caller: 'webfetch',
    intent: inferIntent(goal, options),
    url,
    browser: options.browser || null,
    reason: options.reason || goal || 'webfetch',
  });
  if (request.lane !== 'headless' || !options.allowEphemeralHeadless) {
    await assertLaneReady(request);
  }
  return request;
}

async function runPlaywright(url, goal, options = {}) {
  const timeout = options.timeout || TIMEOUT_MS;
  const laneRequest = await resolvePlaywrightLane(url, goal, { ...options, allowEphemeralHeadless: true });

  let browser = null;
  let context = null;
  let page = null;
  let launchedOwn = false;

  try {
    // Try CDP connection
    const cdpResult = await tryConnectCDP([laneRequest.port]);
    if (cdpResult) {
      browser = cdpResult.browser;
      context = await browser.newContext();
    } else {
      if (laneRequest.lane !== 'headless') {
        throw new Error(`CDP unavailable for ${laneRequest.lane} lane on ${laneRequest.port}`);
      }
      console.error(`[webfetch/playwright] headless CDP unavailable on ${laneRequest.port}, launching ephemeral headless Chromium`);
      browser = await chromium.launch({ headless: true }); // browser-route: allow ephemeral headless
      context = await browser.newContext({ userAgent: 'Ultimate-Web-Fetch/1.0 (+https://github.com/josephtandle/ultimate-web-fetch)' });
      launchedOwn = true;
    }

    page = await context.newPage();
    page.setDefaultTimeout(timeout);

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    // If goal requires interaction, wait for networkidle; otherwise domcontentloaded is enough
    if (goal && INTERACTION_SIGNALS.test(goal)) {
      await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
    }

    const statusCode = response?.status() || null;
    const contentType = response?.headers()['content-type'] || null;
    const html = await page.content();
    const title = await page.title().catch(() => '');

    let screenshotPath = null;
    if (options.screenshot) {
      const screenshotDir = require('path').join(__dirname, '..', '..', 'data');
      const fname = `screenshot-${Date.now()}.png`;
      screenshotPath = require('path').join(screenshotDir, fname);
      await page.screenshot({ path: screenshotPath, fullPage: options.fullPage || false });
    }

    if (options.pdf) {
      const pdfDir = require('path').join(__dirname, '..', '..', 'data');
      const fname = `page-${Date.now()}.pdf`;
      const pdfPath = require('path').join(pdfDir, fname);
      await page.pdf({ path: pdfPath });
      return { success: true, data: { pdfPath }, tool: 'playwright', url };
    }

    return {
      success: true,
      data: { html, title },
      rawHtml: html,
      title,
      tool: 'playwright',
      url,
      meta: { statusCode, contentType, fetchedAt: new Date().toISOString() },
      screenshotPath,
    };
  } catch (err) {
    return { success: false, error: err.message, tool: 'playwright', url };
  } finally {
    // Always clean up context — never leak
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (launchedOwn && browser) await browser.close().catch(() => {});
    // For CDP connections, do NOT close the browser (it would kill the shared Chrome instance)
  }
}

async function takeScreenshot(url, options = {}) {
  const result = await runPlaywright(url, null, { ...options, screenshot: true, fullPage: options.fullPage });
  return result;
}

async function savePdf(url, options = {}) {
  return runPlaywright(url, null, { ...options, pdf: true });
}

async function extractSelector(url, selector, options = {}) {
  const timeout = options.timeout || TIMEOUT_MS;
  let browser = null, context = null, page = null, launchedOwn = false;
  try {
    const laneRequest = await resolvePlaywrightLane(url, null, {
      ...options,
      intent: options.intent || 'anonymous_scrape',
      allowEphemeralHeadless: true,
    });
    const cdpResult = await tryConnectCDP([laneRequest.port]);
    if (cdpResult) {
      browser = cdpResult.browser;
      context = await browser.newContext();
    } else {
      if (laneRequest.lane !== 'headless') {
        throw new Error(`CDP unavailable for ${laneRequest.lane} lane on ${laneRequest.port}`);
      }
      browser = await chromium.launch({ headless: true }); // browser-route: allow ephemeral headless
      context = await browser.newContext();
      launchedOwn = true;
    }
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    let data;
    if (options.all) {
      data = await page.$$eval(selector, (els, attr) => els.map(el => attr ? el.getAttribute(attr) : el.textContent?.trim()), options.attr || null);
    } else {
      data = await page.$eval(selector, (el, attr) => attr ? el.getAttribute(attr) : el.textContent?.trim(), options.attr || null).catch(() => null);
    }

    return { success: true, data, url, selector, tool: 'playwright' };
  } catch (err) {
    return { success: false, error: err.message, url, selector, tool: 'playwright' };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (launchedOwn && browser) await browser.close().catch(() => {});
  }
}

async function checkInstalled() {
  try {
    require('playwright');
    return { installed: true, version: require('playwright/package.json').version };
  } catch {
    return { installed: false };
  }
}

module.exports = { runPlaywright, takeScreenshot, savePdf, extractSelector, checkInstalled, needsAgentLane };
