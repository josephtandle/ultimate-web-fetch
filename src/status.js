'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATUS_DIR = process.env.ULTIMATE_WEB_FETCH_STATE_DIR || path.join(os.homedir(), '.ultimate-web-fetch');
const STATUS_PATH = path.join(STATUS_DIR, 'status.json');

function writeStatus(status, lastResult, lastMessage, errorCount = 0) {
  const payload = {
    agentId: 'webfetch',
    status,
    lastRun: new Date().toISOString(),
    lastResult,
    lastMessage,
    errorCount,
    enabled: true,
  };
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2) + '\n');
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return { agentId: 'webfetch', status: 'unknown', lastRun: null, lastResult: null, lastMessage: 'No status yet', errorCount: 0, enabled: true };
  }
}

module.exports = { writeStatus, readStatus };
