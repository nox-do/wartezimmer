#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function readIdsFromDomainAllowlist(filePath) {
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
const domainIds = readIdsFromDomainAllowlist(
  path.join(root, 'packages/domain/src/topic-icon-ids.ts'),
);
const uiIds = readIdsFromUiCatalog(path.join(root, 'ui/src/lib/topics/topic-icon-catalog.ts'));

const onlyInDomain = domainIds.filter((id) => !uiIds.includes(id));
const onlyInUi = uiIds.filter((id) => !domainIds.includes(id));

if (onlyInDomain.length > 0 || onlyInUi.length > 0) {
  console.error('Topic icon allowlist drift detected.');
  if (onlyInDomain.length > 0) {
    console.error('Only in domain:', onlyInDomain.join(', '));
  }
  if (onlyInUi.length > 0) {
    console.error('Only in ui catalog:', onlyInUi.join(', '));
  }
  process.exit(1);
}

console.log(`Topic icon allowlists in sync (${domainIds.length} ids).`);
