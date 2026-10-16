#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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

const result = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/generate-fastify-schemas.mjs'), '--check'],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  assertGeneratedFilesTracked(generatedFiles, 'check-fastify-schemas-sync', root);
  console.log('check-fastify-schemas-sync: OK');
}
