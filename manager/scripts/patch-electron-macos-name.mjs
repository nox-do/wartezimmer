#!/usr/bin/env node
/**
 * Dev-only: generic Electron.app reports "Electron" in the macOS menu bar.
 * app.setName() does not override CFBundleName from the bundle (see electron#19892).
 * Patch the local electron dist once per dev start (idempotent; reset on npm install).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'Wartezimmer Manager';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const managerRoot = path.resolve(scriptDir, '..');

function resolveElectronPlist() {
  const candidates = [
    path.join(managerRoot, 'node_modules/electron/dist/Electron.app/Contents/Info.plist'),
    path.resolve(managerRoot, '../node_modules/electron/dist/Electron.app/Contents/Info.plist'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function bundleName(xml) {
  const match = xml.match(/<key>CFBundleName<\/key>\s*<string>([^<]*)<\/string>/);
  return match?.[1] ?? null;
}

function patchPlist(plistPath) {
  const xml = fs.readFileSync(plistPath, 'utf8');
  if (bundleName(xml) === APP_NAME) {
    return false;
  }

  const patched = xml
    .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${APP_NAME}$2`)
    .replace(/(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${APP_NAME}$2`);

  fs.writeFileSync(plistPath, patched);
  return true;
}

if (process.platform !== 'darwin') {
  process.exit(0);
}

const plistPath = resolveElectronPlist();
if (!plistPath) {
  console.warn('[manager] electron dist not found — skip macOS menu name patch');
  process.exit(0);
}

if (patchPlist(plistPath)) {
  console.log(`[manager] macOS menu name: Electron → ${APP_NAME}`);
}
