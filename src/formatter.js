'use strict';

const TurndownService = require('turndown');

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

function toMarkdown(html) {
  try {
    return turndown.turndown(html || '');
  } catch {
    return stripTags(html || '');
  }
}

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const m = (html || '').match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

function format(rawContent, fmt, meta = {}) {
  const f = (fmt || 'markdown').toLowerCase();
  switch (f) {
    case 'html':
      return rawContent;
    case 'text':
      return stripTags(rawContent);
    case 'json': {
      const title = extractTitle(rawContent);
      const content = toMarkdown(rawContent);
      return JSON.stringify({
        url: meta.url || null,
        title,
        content,
        meta: {
          statusCode: meta.statusCode || null,
          contentType: meta.contentType || null,
          fetchedAt: meta.fetchedAt || new Date().toISOString(),
        },
        tool: meta.tool || null,
        cached: meta.cached || false,
      }, null, 2);
    }
    case 'markdown':
    default:
      return toMarkdown(rawContent);
  }
}

module.exports = { format, toMarkdown, stripTags, extractTitle };
