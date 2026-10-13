#!/usr/bin/env node
import path from 'node:path';
import { assertProductionTree } from './production-artifacts.mjs';

if (!process.argv.slice(2).length)
  throw new Error('Usage: check-production-artifacts.mjs <output-directory> ...');
for (const directory of process.argv.slice(2)) {
  assertProductionTree(path.resolve(directory));
  console.log(`Production files OK: ${directory}`);
}
