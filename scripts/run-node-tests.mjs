#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = [];
const excludes = new Set();
const imports = [];

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  const next = process.argv[index + 1];
  if (arg === '--root' && next) {
    roots.push(next);
    index += 1;
    continue;
  }
  if (arg === '--exclude' && next) {
    excludes.add(normalizePath(next));
    index += 1;
    continue;
  }
  if (arg === '--import' && next) {
    imports.push(next);
    index += 1;
    continue;
  }
  throw new Error(`Unknown or incomplete argument: ${arg}`);
}

if (roots.length === 0) {
  roots.push('src');
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function collectTestFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(entryPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      const relativePath = normalizePath(path.relative(process.cwd(), entryPath));
      if (!excludes.has(relativePath)) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

const files = roots
  .flatMap((root) => collectTestFiles(path.resolve(process.cwd(), root)))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  throw new Error('No test files matched.');
}

const nodeArgs = imports.flatMap((moduleName) => ['--import', moduleName]);
const result = spawnSync(
  process.execPath,
  [...nodeArgs, '--test', '--test-reporter=dot', ...files],
  {
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
