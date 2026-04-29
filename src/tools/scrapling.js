'use strict';

const { runPython } = require('./command-resolver');

const TIMEOUT_MS = 30000;

const FETCH_SCRIPT = `
import sys, json, logging
logging.disable(logging.CRITICAL)
try:
    from scrapling import Fetcher
    url = sys.argv[1]
    fetcher = Fetcher(auto_match=False)
    page = fetcher.get(url)
    html = page.html_content or ''
    text = page.get_all_text(ignore_tags=('script','style')) or ''
    title_el = page.find('title')
    title = title_el.text if title_el else ''
    print(json.dumps({
        "success": True,
        "html": html,
        "text": text,
        "title": title,
        "url": url,
    }))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

async function runScrapling(url, goal, options = {}) {
  const timeout = options.timeout || TIMEOUT_MS;
  try {
    const { stdout } = await runPython('SCRAPLING_PYTHON', ['-c', FETCH_SCRIPT, url], {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    const result = JSON.parse(stdout.trim());
    if (!result.success) {
      return { success: false, error: result.error, tool: 'scrapling' };
    }
    return {
      success: true,
      data: { html: result.html, text: result.text, title: result.title },
      rawHtml: result.html,
      tool: 'scrapling',
      url,
    };
  } catch (err) {
    return { success: false, error: err.message, tool: 'scrapling' };
  }
}

async function checkInstalled() {
  try {
    const { stdout, python, source } = await runPython('SCRAPLING_PYTHON', ['-c', 'import scrapling; print(scrapling.__version__)'], { timeout: 5000 });
    return { installed: true, version: stdout.trim(), python, source };
  } catch (err) {
    return {
      installed: false,
      python: null,
      install: 'python -m pip install scrapling',
      error: err.message,
    };
  }
}

module.exports = { runScrapling, checkInstalled };
