#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRootFromImportMeta } from './openapi-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const bundlePath = 'openapi/bundle.json';
const previous = fs.existsSync(path.join(root, bundlePath))
  ? fs.readFileSync(path.join(root, bundlePath))
  : null;

const generate = spawnSync(process.execPath, [path.join(root, 'scripts/bundle-openapi.mjs')], {
  cwd: root,
  stdio: 'inherit',
});

if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

if (!fs.existsSync(path.join(root, bundlePath))) {
  console.error(`check-bundle-sync: missing ${bundlePath}`);
  process.exit(1);
}

if (!previous || !previous.equals(fs.readFileSync(path.join(root, bundlePath)))) {
  console.error(`check-bundle-sync: ${bundlePath} out of date — run npm run bundle:openapi`);
  process.exit(1);
}

console.log('check-bundle-sync: OK');
