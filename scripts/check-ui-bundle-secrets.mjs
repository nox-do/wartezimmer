#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadUiDotEnvFiles } from './dotenv.mjs';

const repoRoot = process.cwd();
loadUiDotEnvFiles(repoRoot);

const candidateDirs = [path.join(repoRoot, 'ui/build'), path.join(repoRoot, 'app/dist/ui-static')];
const existingDirs = candidateDirs.filter((dir) => fs.existsSync(dir));

if (existingDirs.length === 0) {
  console.error('check-ui-bundle-secrets: no built UI found (run npm run build:ui first)');
  process.exit(1);
}

const literalNeedles = [
  'VITE_API_KEY',
  'VITE_API_KEY_TERMINAL',
  'VITE_API_KEY_TV',
  'VITE_API_KEY_OPS',
  'AUTH_KEY_MFA',
  'AUTH_KEY_OPS',
  'AUTH_KEY_TV',
  'AUTH_KEY_TERMINAL',
  'AUTH_KEY_CAPTIVE',
  'SANDBOX_INTERNAL_TOKEN',
  'OPENNDS_FAS_KEY',
  'change-me-mfa-key',
  'change-me-ops-key',
  'change-me-tv-key',
  'change-me-terminal-key',
  'change-me-captive-key',
  'change-me-sandbox-internal-token',
  'change-me-opennds-fas-key',
];

const envNeedleKeys = [
  'VITE_API_KEY',
  'VITE_API_KEY_TERMINAL',
  'VITE_API_KEY_TV',
  'VITE_API_KEY_OPS',
  'AUTH_KEY_MFA',
  'AUTH_KEY_OPS',
  'AUTH_KEY_TV',
  'AUTH_KEY_TERMINAL',
  'AUTH_KEY_CAPTIVE',
  'SANDBOX_INTERNAL_TOKEN',
  'OPENNDS_FAS_KEY',
];

const binaryExtensions = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.wasm',
  '.webp',
  '.woff',
  '.woff2',
]);

function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile() && !binaryExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

const needles = [
  ...literalNeedles.map((value) => ({ label: value, value })),
  ...envNeedleKeys
    .map((key) => process.env[key]?.trim())
    .filter((value) => value && value.length >= 8)
    .map((value) => ({ label: '[env secret value]', value })),
];

const findings = [];
for (const dir of existingDirs) {
  for (const file of collectFiles(dir)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (content.includes(needle.value)) {
        findings.push(`${path.relative(repoRoot, file)} contains ${needle.label}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error('check-ui-bundle-secrets: FAILED');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `check-ui-bundle-secrets: OK (${existingDirs.map((dir) => path.relative(repoRoot, dir)).join(', ')})`,
);
