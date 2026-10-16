#!/usr/bin/env node

import path from 'node:path';
import { loadAndMergeOpenApi, repoRootFromImportMeta } from './openapi-lib.mjs';
import { writePrettierFile } from './prettier-write.mjs';

const root = repoRootFromImportMeta(import.meta.url);
const check = process.argv.includes('--check');
const outPath = path.join(root, 'openapi/bundle.json');

const bundled = await loadAndMergeOpenApi(root);
await writePrettierFile(outPath, `${JSON.stringify(bundled, null, 2)}\n`, { check });
console.log(
  `bundle-openapi: ${check ? 'checked' : 'wrote'} ${outPath} (${Object.keys(bundled.paths ?? {}).length} paths)`,
);
