#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRootFromImportMeta } from './openapi-lib.mjs';
import { assertGeneratedFilesTracked } from './check-generated-tracked.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const generatedFiles = [
  'app/src/api/generated/checkin-openapi.d.ts',
  'app/src/api/generated/queue-openapi.d.ts',
  'app/src/api/generated/identity-openapi.d.ts',
  'app/src/api/generated/ops-openapi.d.ts',
  'app/src/api/generated/documents-openapi.d.ts',
  'app/src/api/generated/auth-openapi.d.ts',
];

const generate = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/generate-app-openapi-types.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

let failed = false;
for (const relativePath of generatedFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    console.error(`check-app-openapi-types-sync: missing ${relativePath}`);
    failed = true;
    continue;
  }
  const diff = spawnSync('git', ['diff', '--exit-code', '--', relativePath], {
    cwd: root,
    stdio: 'inherit',
  });
  if (diff.status !== 0) {
    failed = true;
    console.error(
      `check-app-openapi-types-sync: ${relativePath} out of date — run npm run generate:api`,
    );
  }
}

if (failed) {
  process.exit(1);
}

assertGeneratedFilesTracked(generatedFiles, 'check-app-openapi-types-sync');

console.log('check-app-openapi-types-sync: OK');
