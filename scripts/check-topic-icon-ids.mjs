#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function readIdsFromAppAllowlist(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/export const TOPIC_ICON_IDS = \[([\s\S]*?)\] as const;/);
  if (!match) {
    throw new Error(`Could not parse TOPIC_ICON_IDS from ${filePath}`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
}

function readIdsFromUiCatalog(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return [...source.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((entry) => entry[1]).sort();
}

const root = process.cwd();
const appIds = readIdsFromAppAllowlist(path.join(root, 'app/src/shared/topic-icon-ids.ts'));
const uiIds = readIdsFromUiCatalog(path.join(root, 'ui/src/lib/topics/topic-icon-catalog.ts'));

const onlyInApp = appIds.filter((id) => !uiIds.includes(id));
const onlyInUi = uiIds.filter((id) => !appIds.includes(id));

if (onlyInApp.length > 0 || onlyInUi.length > 0) {
  console.error('Topic icon allowlist drift detected.');
  if (onlyInApp.length > 0) {
    console.error('Only in app:', onlyInApp.join(', '));
  }
  if (onlyInUi.length > 0) {
    console.error('Only in ui:', onlyInUi.join(', '));
  }
  process.exit(1);
}

console.log(`Topic icon allowlists in sync (${appIds.length} ids).`);
