#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { repoRootFromImportMeta } from './openapi-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);

export function assertGeneratedFilesTracked(relativePaths, label) {
  let failed = false;
  for (const relativePath of relativePaths) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: root,
      stdio: 'ignore',
    });
    if (tracked.status !== 0) {
      failed = true;
      console.error(
        `${label}: ${relativePath} is not tracked in git — git add and commit generated artifacts`,
      );
    }
  }
  if (failed) {
    process.exit(1);
  }
}
