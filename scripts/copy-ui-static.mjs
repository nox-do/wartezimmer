#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { assertProductionTree } from './production-artifacts.mjs';

const repoRoot = process.cwd();
const source = path.join(repoRoot, 'ui/build');
const target = path.join(repoRoot, 'app/dist/ui-static');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error('copy-ui-static: ui/build/index.html missing; run npm run build:ui first');
  process.exit(1);
}

assertProductionTree(source);
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`copy-ui-static: ${source} -> ${target}`);
