#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { writeStatus, readStatus } = require('./status');
const { fetchUrl, screenshot, screenshotBatch, screenshotSections, pdf, downloadMedia, extractSelector, batchFetch, getInstalled } = require('./api');
const { checkInstalled: shotScraperCheck } = require('./tools/shot-scraper');
const cache = require('./cache');
const { listAdapters } = require('./tools/opencli');
const { checkInstalled: scrapling_check } = require('./tools/scrapling');
const { checkInstalled: playwright_check } = require('./tools/playwright');
const { checkInstalled: opencli_check } = require('./tools/opencli');
const { checkInstalled: browseruse_check } = require('./tools/browser-use');
const { checkInstalled: ytdlp_check } = require('./tools/yt-dlp');

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
    i++;
  }
  return args;
}

function out(data) {
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

function err(msg) {
  console.error(`[webfetch] ${msg}`);
}

async function main() {
  const [,, command, ...rest] = process.argv;
  const args = parseArgs(rest);
  const f = args.flags;

  try {
    switch (command) {

      case 'fetch': {
        const url = args._[0] || f.url;
        if (!url) { err('Usage: webfetch fetch <url> [--goal "..."] [--tool ...] [--dry-run]'); process.exit(1); }

        const goal = f.goal || null;
        const forcedTool = f.tool || null;
        const fmt = f.format || 'markdown';
        const dryRun = Boolean(f['dry-run']);
        const noCache = Boolean(f['no-cache']);
        const cacheTtlMs = f['cache-ttl'] ? Number(f['cache-ttl']) * 1000 : null;
        const ignoreRobots = Boolean(f['ignore-robots']);
        const delayMs = f.delay ? Number(f.delay) : 1000;
        const browser = f.browser || null;

        writeStatus('working', 'skipped', `Fetching ${url}`);

        const result = await fetchUrl(url, { goal, tool: forcedTool, format: fmt, dryRun, noCache, cacheTtlMs, ignoreRobots, delayMs, browser });
        out(result);

        if (result.dryRun) {
          writeStatus('idle', 'success', `Dry run: would use ${result.tool}`);
        } else if (result.success) {
          writeStatus('idle', 'success', `Fetched ${url} via ${result.tool}${result.cached ? ' (cached)' : ''}`);
        } else {
          writeStatus('error', 'error', result.error, 1);
        }
        break;
      }

      case 'screenshot': {
        const url = args._[0] || f.url;
        if (!url) { err('Usage: webfetch screenshot <url> [--tool shot-scraper] [--full-page] [--selector "CSS"] [--retina] [--js "code"] [--output <path>]'); process.exit(1); }
        writeStatus('working', 'skipped', `Taking screenshot of ${url}`);
        const result = await screenshot(url, {
          browser: f.browser || null,
          fullPage: Boolean(f['full-page']),
          output: f.output || null,
          tool: f.tool || null,
          selector: f.selector || null,
          retina: Boolean(f.retina),
          javascript: f.js || f.javascript || null,
          width: f.width ? Number(f.width) : null,
          waitFor: f['wait-for'] || null,
        });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `Screenshot saved: ${result.path}` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'shots': {
        const shotsFile = args._[0] || f.file;
        if (!shotsFile) { err('Usage: webfetch shots <shots.yml> [--output-dir <dir>]'); process.exit(1); }
        writeStatus('working', 'skipped', `Running shot-scraper batch: ${shotsFile}`);
        const result = await screenshotBatch(shotsFile, { outputDir: f['output-dir'] || null });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `Batch complete: ${result.outputDir}` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'screenshot-sections': {
        const url = args._[0] || f.url;
        const outputDir = f['output-dir'] || f.output;
        if (!url || !outputDir) { err('Usage: webfetch screenshot-sections <url> --output-dir <dir> [--retina] [--js "code"]'); process.exit(1); }
        writeStatus('working', 'skipped', `Screenshotting all sections of ${url}`);
        const result = await screenshotSections(url, [], outputDir, {
          retina: Boolean(f.retina),
          javascript: f.js || f.javascript || null,
          width: f.width ? Number(f.width) : 1440,
        });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `${result.succeeded} screenshots saved to ${outputDir}` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'pdf': {
        const url = args._[0] || f.url;
        if (!url) { err('Usage: webfetch pdf <url> [--browser agent|headless] [--output <path>]'); process.exit(1); }
        writeStatus('working', 'skipped', `Saving PDF of ${url}`);
        const result = await pdf(url, { browser: f.browser || null, output: f.output || null });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `PDF saved` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'media': {
        const url = args._[0] || f.url;
        if (!url) { err('Usage: webfetch media <url> [--output-dir <dir>] [--audio-only] [--subtitles] [--cookies-from-browser chrome|safari|firefox --allow-browser-cookies]'); process.exit(1); }
        writeStatus('working', 'skipped', `Downloading media from ${url}`);
        const result = await downloadMedia(url, {
          outputDir: f['output-dir'] || f.output || undefined,
          outputTemplate: f.template || null,
          audioOnly: Boolean(f['audio-only']),
          subtitles: Boolean(f.subtitles),
          cookiesFromBrowser: f['cookies-from-browser'] || null,
          allowBrowserCookies: Boolean(f['allow-browser-cookies']),
          format: f.format || null,
        });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `Media saved: ${result.path || result.files?.length || 0}` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'extract': {
        const url = args._[0] || f.url;
        const selector = f.selector;
        if (!url || !selector) { err('Usage: webfetch extract <url> --selector "CSS selector" [--all] [--attr <attribute>]'); process.exit(1); }
        writeStatus('working', 'skipped', `Extracting ${selector} from ${url}`);
        const result = await extractSelector(url, selector, { all: Boolean(f.all), attr: f.attr || null, browser: f.browser || null });
        out(result);
        writeStatus('idle', result.success ? 'success' : 'error', result.success ? `Extracted ${selector}` : result.error, result.success ? 0 : 1);
        break;
      }

      case 'batch': {
        const manifestFile = args._[0] || f.file;
        if (!manifestFile) { err('Usage: webfetch batch <manifest.json>'); process.exit(1); }
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        writeStatus('working', 'skipped', `Batch fetching ${manifest.length} URLs`);
        const result = await batchFetch(manifest, { format: f.format || 'markdown', browser: f.browser || null });
        out(result);
        writeStatus('idle', 'success', `Batch: ${result.succeeded}/${manifest.length} succeeded`);
        break;
      }

      case 'adapters': {
        out('Refreshing OpenCLI adapter list...');
        const result = await listAdapters();
        if (result.success) {
          out(`Found ${result.adapters.length} adapters:`);
          out(result.adapters);
        } else {
          out(`OpenCLI not installed or list failed: ${result.error}`);
        }
        writeStatus('idle', result.success ? 'success' : 'error', `Adapters: ${result.success ? result.adapters.length + ' found' : result.error}`);
        break;
      }

      case 'cache': {
        const entries = cache.list();
        if (entries.length === 0) {
          out('Cache is empty.');
        } else {
          out(`${entries.length} cached entries:`);
          for (const e of entries) {
            const age = e.ageSeconds < 60 ? `${e.ageSeconds}s` : `${Math.round(e.ageSeconds / 60)}m`;
            const exp = e.expired ? 'EXPIRED' : `expires in ${Math.round(e.expiresInSeconds / 60)}m`;
            const size = e.sizeBytes > 1024 ? `${Math.round(e.sizeBytes / 1024)}KB` : `${e.sizeBytes}B`;
            out(`  [${e.tool}] ${e.url} (${age} ago, ${exp}, ${size})${e.goal ? ` — ${e.goal}` : ''}`);
          }
        }
        break;
      }

      case 'clear-cache': {
        const domain = f.domain || null;
        const count = cache.clear(domain);
        out(`Cleared ${count} cache ${count === 1 ? 'entry' : 'entries'}${domain ? ` for ${domain}` : ''}.`);
        break;
      }

      case 'status': {
        out(readStatus());
        break;
      }

      case 'preflight': {
        const [sc, pw, oc, bu, ss, yd] = await Promise.all([
          scrapling_check(), playwright_check(), opencli_check(), browseruse_check(), shotScraperCheck(), ytdlp_check(),
        ]);

        const report = {
          scrapling: { ...sc },
          playwright: { ...pw },
          opencli: { ...oc },
          browserUse: { ...bu },
          shotScraper: { ...ss },
          ytDlp: { ...yd },
        };

        out(report);

        const allOk = sc.installed && pw.installed;
        const status = allOk ? 'All core tools ready.' : 'Some tools not installed — see report above.';
        out(status);
        writeStatus('idle', 'success', `Preflight: scrapling=${sc.installed} playwright=${pw.installed} opencli=${oc.installed} browser-use=${bu.installed} shot-scraper=${ss.installed} yt-dlp=${yd.installed}`);
        break;
      }

      default: {
        out(`WebFetch — unified browser automation agent

Commands:
  fetch <url> [--goal "..."] [--tool playwright|scrapling|opencli|browser-use]
              [--dry-run] [--format markdown|json|text|html]
              [--browser agent|headless] [--no-cache] [--cache-ttl <seconds>]
              [--ignore-robots] [--delay <ms>]
  screenshot <url> [--tool shot-scraper] [--full-page] [--selector "CSS"]
                   [--retina] [--js "JS code"] [--wait-for "CSS"]
                   [--width 1440] [--browser agent|headless] [--output <path>]
  shots <shots.yml> [--output-dir <dir>]    shot-scraper YAML batch
  screenshot-sections <url> --output-dir <dir> [--retina] [--js "code"]
  pdf <url> [--browser agent|headless] [--output <path>]
  media <url> [--output-dir <dir>] [--audio-only] [--subtitles]
              [--cookies-from-browser chrome|safari|firefox --allow-browser-cookies]
  extract <url> --selector "CSS selector" [--all] [--attr <attribute>]
  batch <manifest.json>
  adapters       Refresh OpenCLI adapter list
  cache          List cached entries
  clear-cache    [--domain <domain>] [--all]
  status         Show agent status
  preflight      Check all tools are installed (includes shot-scraper and yt-dlp)`);
      }
    }
  } catch (e) {
    err(e.message);
    writeStatus('error', 'error', e.message, 1);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
