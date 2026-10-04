'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { selectTool } = require('../router');
const { fetchUrl } = require('../api');
const { resolveBrowserRequest } = require('../browser-route');
const { canUseEphemeralHeadless } = require('../tools/playwright');

test('forced tools use their actual installed capability name', () => {
  assert.equal(selectTool('https://example.com', null, { installed: { browserUse: true }, forcedTool: 'browser-use' }), 'browser-use');
  assert.throws(() => selectTool('https://example.com', null, { installed: { playwright: false }, forcedTool: 'playwright' }), /not installed/);
  assert.throws(() => selectTool('https://example.com', null, { installed: {}, forcedTool: 'made-up' }), /Unknown tool/);
});

test('automatic routing reports when no fetch backend exists', () => {
  assert.throws(() => selectTool('https://example.com', null, { installed: {} }), /No usable fetch tool/);
});

test('dry run does not contact the destination or robots.txt', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('unexpected network request'); };
  try {
    const result = await fetchUrl('https://example.com', { dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(typeof result.tool, 'string');
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetch rejects non-web URL schemes before tools run', async () => {
  await assert.rejects(fetchUrl('file:///etc/passwd', { dryRun: true }), /Unsupported URL scheme/);
});

test('authenticated intent needs an explicit personal browser choice', () => {
  assert.throws(() => resolveBrowserRequest({ intent: 'auth_user_visible', url: 'https://example.com' }), /Pass --browser personal/);
  assert.equal(resolveBrowserRequest({ intent: 'auth_user_visible', browser: 'personal' }).lane, 'personal');
  assert.throws(() => resolveBrowserRequest({ intent: 'auth_user_visible', browser: 'headless' }), /Pass --browser personal/);
});

test('only implicit capture work can fall back from agent CDP to ephemeral headless', () => {
  assert.equal(canUseEphemeralHeadless({ lane: 'agent' }, { screenshot: true }), true);
  assert.equal(canUseEphemeralHeadless({ lane: 'agent' }, { pdf: true }), true);
  assert.equal(canUseEphemeralHeadless({ lane: 'agent' }, { screenshot: true, browser: 'agent' }), false);
  assert.equal(canUseEphemeralHeadless({ lane: 'personal' }, { screenshot: true }), false);
  assert.equal(canUseEphemeralHeadless({ lane: 'agent' }, {}), false);
});
