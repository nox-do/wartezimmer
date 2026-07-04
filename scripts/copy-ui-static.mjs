#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const source = path.join(repoRoot, 'ui/build');
const target = path.join(repoRoot, 'app/dist/ui-static');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.log('copy-ui-static: ui/build missing, skip');
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`copy-ui-static: ${source} -> ${target}`);
