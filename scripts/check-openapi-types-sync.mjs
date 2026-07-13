#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const generatedFiles = [
  'ui/src/lib/ops/generated/ops-openapi.d.ts',
  'ui/src/lib/queue/generated/queue-openapi.d.ts',
  'ui/src/lib/documents/generated/documents-openapi.d.ts',
  'ui/src/lib/terminal/generated/checkin-openapi.d.ts',
  'ui/src/lib/auth/generated/auth-openapi.d.ts',
];

const generate = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/generate-openapi-types.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

for (const relativePath of generatedFiles) {
  const generated = path.join(root, relativePath);
  if (!fs.existsSync(generated)) {
    console.error(
      `check-openapi-types-sync: generated file missing after generate: ${relativePath}`,
    );
    process.exit(1);
  }
}

let failed = false;

for (const relativePath of generatedFiles) {
  const diff = spawnSync('git', ['diff', '--exit-code', '--', relativePath], {
    cwd: root,
    stdio: 'inherit',
  });

  if (diff.status !== 0) {
    failed = true;
    console.error(
      `check-openapi-types-sync: ${relativePath} is out of date — run npm run generate:openapi-types and commit.`,
    );
  }
}

if (failed) {
  process.exit(1);
}

console.log('check-openapi-types-sync: OK');
