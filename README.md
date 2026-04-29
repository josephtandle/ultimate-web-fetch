# Ultimate Web Fetch

Unified web fetching, scraping, screenshot, PDF, extraction, and authorized media download CLI. It accepts a web task and routes it to the best available local tool automatically.

**Naming note:** Claude Code has a built-in tool also called `WebFetch`. This is a standalone CLI/package, not that built-in tool.

---

## Tools

| Tool | Best for | Status |
|------|----------|--------|
| **Scrapling** | Fast static scraping, no JS needed | Installed |
| **Playwright** | JS-heavy pages, form fills, screenshots, PDFs | Installed |
| **browser-use** | Autonomous multi-step tasks (AI-driven) | Installed |
| **OpenCLI** | Known-site adapters, zero runtime tokens | Not installed (pip wheel issue) |
| **BeautifulSoup (bs4)** | Lightweight HTML parsing after fetch — element/link/text extraction | Installed |
| **yt-dlp** | Download public or authorized video/audio media for offline analysis | Optional, checked by preflight |

---

## HTML Parsing

**bs4 (BeautifulSoup4)** is available on python3.11 for post-fetch HTML parsing. Use it when you already have HTML and need to extract elements, links, or text — no browser needed. Installed on both python3 (3.9) and python3.11.

Use Scrapling when you need to fetch + parse as a unit. Use bs4 when you have raw HTML and just need to walk the DOM.

---

## Commands

```bash
# Core
webfetch fetch <url> [--goal "..."] [options]
webfetch screenshot <url> [--full-page] [--browser agent|headless] [--output <path>]
webfetch pdf <url> [--browser agent|headless] [--output <path>]
webfetch media <url> [--output-dir <dir>] [--audio-only] [--subtitles]
webfetch extract <url> --selector "CSS selector" [--all] [--attr <attribute>]
webfetch batch <manifest.json>

# Management
webfetch adapters          # Refresh OpenCLI adapter list
webfetch cache             # List cached entries
webfetch clear-cache       # [--domain <domain>]
webfetch status            # Current status
webfetch preflight         # Check all tools installed
```

### fetch flags

| Flag | Default | Description |
|------|---------|-------------|
| `--goal "..."` | none | Extraction goal — triggers LLM extraction after fetch |
| `--tool <name>` | auto | Force a specific tool |
| `--dry-run` | false | Show which tool would be used, without fetching |
| `--format markdown\|json\|text\|html` | markdown | Output format |
| `--browser agent\|headless` | intent-derived | Browser lane override; must match the router-selected intent |
| `--no-cache` | false | Skip cache read and write |
| `--cache-ttl <seconds>` | 1800/300 | Override cache TTL |
| `--ignore-robots` | false | Skip robots.txt check |
| `--delay <ms>` | 1000 | Per-domain delay between requests |

### media flags

`media` uses `yt-dlp` and is intentionally separate from `fetch`, so normal web page extraction still follows robots and browser-lane policy. Use it only for public or authorized media URLs.

| Flag | Default | Description |
|------|---------|-------------|
| `--output-dir <dir>` | `~/Downloads/webfetch-media` | Destination folder |
| `--audio-only` | false | Extract MP3 audio only |
| `--subtitles` | false | Save available manual/automatic subtitles as SRT |
| `--cookies-from-browser <name>` | none | Browser cookie source. Requires `--allow-browser-cookies` |
| `--allow-browser-cookies` | false | Explicit opt-in for authenticated media you are allowed to access |
| `--format <selector>` | yt-dlp default | Force a yt-dlp format selector |

---

## Tool Routing Logic

```
1. --tool flag? → use it
2. OpenCLI adapter exists for this domain? → opencli
3. Goal is autonomous (multi-step, exploratory)? → browser-use
4. Page is likely static (no JS needed)? → scrapling
5. Default → playwright
```

**Static signals:** goal contains "extract/read/scrape", no interaction words, domain is wikipedia/medium/gov/news/blog

**Autonomous signals:** multiple clauses, "find and visit/compile", "research", "compare", "browse until"

**Dynamic signals:** "click/fill/login/submit/navigate/interact", SPA domains (twitter/instagram/linkedin)

---

## Browser Lanes

| Signal | Lane |
|--------|------|
| Scrapling / bs4 | No browser (HTTP only) |
| Pure scraping, anonymous | `anonymous_scrape` -> Headless Browser (9222) | <!-- browser-route: allow -->
| Screenshots, PDFs, QA | `agent_qa` -> Agent Browser (9223) | <!-- browser-route: allow -->
| Autonomous browsing | `agent_research` -> Agent Browser (9223) | <!-- browser-route: allow -->
| Joe-facing auth/open-as-user | Use `browser-route` with `joe_open` or `auth_user_visible`; WebFetch must not use personal by default |

The standalone package includes a conservative browser-lane resolver. If you do not run persistent Chrome debugging ports, Playwright can fall back to an ephemeral headless Chromium for anonymous/headless tasks.

---

## Programmatic API

```js
const { fetchUrl, screenshot, pdf, extractSelector, batchFetch } = require('ultimate-web-fetch/src/api');

// Fetch with optional goal-based extraction
const result = await fetchUrl('https://example.com', {
  goal: 'extract main heading',
  format: 'json',
});
// result: { success, data, tool, url, cached, format }

// Screenshot
const shot = await screenshot('https://example.com', { fullPage: true });
// shot: { success, path, url, tool }

// CSS extraction
const els = await extractSelector('https://example.com', { selector: 'h1', all: true });
// els: { success, data: string[], url, selector }

// Batch fetch
const batch = await batchFetch([{ url: 'https://a.com', goal: '...' }]);
// batch: { results, succeeded, failed }
```

---

## Caching

- **TTL:** 30 minutes (with goal), 5 minutes (without goal)
- **Max size:** 50MB, LRU eviction
- **Key:** SHA-256 of `url + goal + format`
- **Location:** `data/cache/` for page cache, `~/.ultimate-web-fetch/status.json` for CLI status

---

## Installation

```bash
# Clone
git clone https://github.com/josephtandle/ultimate-web-fetch.git
cd ultimate-web-fetch

# Node
npm install
npx playwright install chromium

# Optional media downloads
brew install yt-dlp

# Optional Python tools
python3 -m pip install scrapling curl_cffi browserforge
python3 -m pip install browser-use
python3 -m pip install shot-scraper && shot-scraper install

# Verify
npm run check
node src/index.js preflight
```

## Examples

```bash
# Fetch a static page as Markdown
webfetch fetch https://example.com --format markdown

# Extract every link href
webfetch extract https://example.com --selector "a" --all --attr href

# Take a full-page screenshot
webfetch screenshot https://example.com --full-page --output ./data/example.png

# Download public or authorized media
webfetch media "https://www.instagram.com/reel/..." --output-dir ./downloads

# Extract audio for transcription
webfetch media "https://www.youtube.com/watch?v=..." --audio-only --output-dir ./downloads
```

## Safety

Ultimate Web Fetch is not a bypass tool. Use it for content you own, public pages,
or content you are authorized to access. The media command is intentionally
separate from normal page fetching and shells out to `yt-dlp`; use browser
cookies only when you have permission. Cookie media downloads require the extra
`--allow-browser-cookies` flag so they cannot happen accidentally.

---

## What NOT to Touch

WebFetch is additive. These agents have their own browser tooling — do not refactor them:
- `rapidapi-automator` — Playwright with saved sessions
- `upworker` — Playwright independently
- `human-task-handler` — agent Chrome CDP directly
