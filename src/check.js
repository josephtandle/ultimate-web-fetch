#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = [
  'src/index.js',
  'src/api.js',
  ...walk(path.join(ROOT, 'src', 'tools')).filter(file => file.endsWith('.js')).map(file => path.relative(ROOT, file)),
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { cwd: ROOT, stdio: 'inherit' });
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
