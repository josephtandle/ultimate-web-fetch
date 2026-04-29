'use strict';

const LANES = {
  headless: { lane: 'headless', port: 9222 },
  agent: { lane: 'agent', port: 9223 },
  personal: { lane: 'personal', port: 9224 },
};

function intentToLane(intent) {
  switch (intent) {
    case 'anonymous_scrape':
    case 'ci_browser':
    case 'disposable_check':
      return LANES.headless;
    case 'agent_qa':
    case 'agent_research':
    case 'visible_agent_work':
    case 'build_preview':
      return LANES.agent;
    case 'joe_open':
    case 'mailto':
    case 'auth_user_visible':
      return LANES.personal;
    default:
      return LANES.headless;
  }
}

function resolveBrowserRequest({ intent = 'anonymous_scrape', browser = null, url = '', caller = 'ultimate-web-fetch', reason = '' } = {}) {
  const selected = browser && LANES[browser] ? LANES[browser] : intentToLane(intent);
  return {
    ...selected,
    intent,
    caller,
    url,
    reason,
  };
}

async function assertLaneReady() {
  return true;
}

module.exports = { resolveBrowserRequest, assertLaneReady, LANES };
