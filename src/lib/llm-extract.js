'use strict';

const path = require('path');

// Load local env before optional LLM extraction.
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

let llmCallAsync;
try {
  ({ llmCallAsync } = require(process.env.ULTIMATE_WEB_FETCH_LLM_MODULE || './missing-llm-module'));
} catch {
  llmCallAsync = null;
}

async function extractWithGoal(rawContent, goal, url) {
  if (!llmCallAsync) {
    throw new Error('No LLM module configured. Set ULTIMATE_WEB_FETCH_LLM_MODULE to enable goal-based extraction, or fetch without --goal.');
  }

  const content = typeof rawContent === 'object' ? (rawContent.text || rawContent.html || JSON.stringify(rawContent)) : rawContent;
  const truncated = (content || '').slice(0, 80000);

  const result = await llmCallAsync({
    profile: 'bot_default',
    taskClass: 'cheap_routing',
    systemPrompt: 'You are a web content extraction assistant. Extract the requested information from the web page content provided. Return ONLY the extracted information — no preamble, no commentary, no explanation. If the information is not present in the content, respond with exactly: "Not found."',
    prompt: `URL: ${url}\n\nExtraction goal: ${goal}\n\nPage content:\n${truncated}`,
    maxOutputTokens: 4000,
    temperature: 0,
  });

  return typeof result === 'string' ? result : (result?.text || result?.content || JSON.stringify(result));
}

module.exports = { extractWithGoal };
