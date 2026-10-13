#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assertGeneratedFilesTracked, repoRootFromImportMeta } from './openapi-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const generatedFiles = [
  'app/src/api/generated/common.fastify-schemas.ts',
  'app/src/api/generated/auth.fastify-schemas.ts',
  'app/src/api/generated/checkin.fastify-schemas.ts',
  'app/src/api/generated/queue.fastify-schemas.ts',
  'app/src/api/generated/identity.fastify-schemas.ts',
  'app/src/api/generated/sessions.fastify-schemas.ts',
  'app/src/api/generated/ops.fastify-schemas.ts',
];

const before = new Map(
  generatedFiles.map((file) => [
    file,
    fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : null,
  ]),
);

const generate = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/generate-fastify-schemas.mjs')],
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
    console.error(`check-fastify-schemas-sync: missing ${relativePath}`);
    failed = true;
    continue;
  }
  const previous = before.get(relativePath);
  if (!previous || !previous.equals(fs.readFileSync(path.join(root, relativePath)))) {
    failed = true;
    console.error(
      `check-fastify-schemas-sync: ${relativePath} out of date — run npm run generate:api-schemas`,
    );
  }
}

if (failed) {
  process.exit(1);
}

assertGeneratedFilesTracked(generatedFiles, 'check-fastify-schemas-sync', root);

console.log('check-fastify-schemas-sync: OK');
