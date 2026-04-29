'use strict';

const os = require('os');
const path = require('path');

function stateDir() {
  return process.env.ULTIMATE_WEB_FETCH_STATE_DIR || path.join(os.homedir(), '.ultimate-web-fetch');
}

function cacheDir() {
  return process.env.ULTIMATE_WEB_FETCH_CACHE_DIR || path.join(stateDir(), 'cache');
}

function dataDir() {
  return process.env.ULTIMATE_WEB_FETCH_DATA_DIR || path.join(stateDir(), 'data');
}

function screenshotsDir() {
  return process.env.ULTIMATE_WEB_FETCH_SCREENSHOT_DIR || path.join(dataDir(), 'screenshots');
}

function downloadsDir() {
  return process.env.ULTIMATE_WEB_FETCH_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads', 'webfetch-media');
}

module.exports = { cacheDir, dataDir, downloadsDir, screenshotsDir, stateDir };
