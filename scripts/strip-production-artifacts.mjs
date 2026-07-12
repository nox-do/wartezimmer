#!/usr/bin/env node
/**
 * Remove TypeScript sources and type/debug artifacts from production trees.
 * Used in Docker release builds and Manager packaging — not in local dev builds.
 */

import fs from 'node:fs';
import path from 'node:path';

const baseDir = process.cwd();

function shouldDropDistFile(fileName) {
  return (
    fileName.endsWith('.d.ts') ||
    fileName.endsWith('.d.ts.map') ||
    fileName.endsWith('.js.map') ||
    fileName.endsWith('.ts') ||
    fileName.endsWith('.tsx')
  );
}

function stripDistTree(distDir) {
  if (!fs.existsSync(distDir)) {
    return;
  }

  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const fullPath = path.join(distDir, entry.name);
    if (entry.isDirectory()) {
      stripDistTree(fullPath);
      continue;
    }
    if (shouldDropDistFile(entry.name)) {
      fs.unlinkSync(fullPath);
    }
  }
}

function stripPackageDir(packageDir) {
  const abs = path.resolve(packageDir);
  if (!fs.existsSync(abs)) {
    throw new Error(`strip-production-artifacts: path missing: ${packageDir}`);
  }

  for (const entryName of ['src', 'test', 'tests']) {
    const target = path.join(abs, entryName);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }

  for (const entry of fs.readdirSync(abs)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'db') {
      continue;
    }
    if (entry.startsWith('tsconfig') && entry.endsWith('.json')) {
      fs.unlinkSync(path.join(abs, entry));
    }
  }

  stripDistTree(path.join(abs, 'dist'));
}

function stripFlatDist(distDir) {
  const abs = path.resolve(distDir);
  if (!fs.existsSync(abs)) {
    throw new Error(`strip-production-artifacts: dist missing: ${distDir}`);
  }

  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const fullPath = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      stripDistTree(fullPath);
      continue;
    }
    if (shouldDropDistFile(entry.name)) {
      fs.unlinkSync(fullPath);
    }
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    'Usage: node scripts/strip-production-artifacts.mjs <packageDir>|dist:<distDir> ...',
  );
  process.exit(1);
}

for (const target of args) {
  if (target.startsWith('dist:')) {
    stripFlatDist(path.join(baseDir, target.slice('dist:'.length)));
    console.log(`strip-production-artifacts: cleaned dist ${target.slice('dist:'.length)}`);
    continue;
  }

  stripPackageDir(path.isAbsolute(target) ? target : path.join(baseDir, target));
  console.log(`strip-production-artifacts: cleaned package ${target}`);
}
