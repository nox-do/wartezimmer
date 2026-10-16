#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repoRootFromImportMeta } from './openapi-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const result = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/bundle-openapi.mjs'), '--check'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
