#!/usr/bin/env node
/**
 * Create a text-only, reproducible source dump for a Praxis Flow workspace area.
 * Existing dumps are never overwritten; remove or rename one deliberately first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_CONFIG_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'eslint.config.js',
  'prettier.config.cjs',
  'stylelint.config.js',
  '.editorconfig',
  '.gitignore',
];

const AREA_PATHS = {
  manager: ['manager'],
  core: ['packages/domain', 'packages/flow-core', 'packages/server-shared'],
  app: ['app', 'packages/domain', 'packages/flow-core', 'packages/server-shared', 'openapi'],
  sandbox: ['sandbox', 'packages/server-shared'],
  ui: ['ui', 'packages/domain'],
  setup: [
    'setup',
    'scripts',
    'proxy',
    'docker-compose.yml',
    'docker-compose.delivery.yml',
    'docker-compose.proxy.yml',
    'docker-compose.proxy.delivery.yml',
    'docker-compose.proxy-tls.yml',
    'docker-compose.proxy-tls.delivery.yml',
  ],
};

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.tmp',
  '.svelte-kit',
  'build',
  'cache',
  'coverage',
  'data',
  'dist',
  'docs_data',
  'lab',
  'logs',
  'node_modules',
  'state',
  'test',
  'tests',
]);
const TEST_FILE = /(?:^|\.)test\.[^/]+$|(?:^|\.)spec\.[^/]+$/i;
const ENV_FILE = /^\.env(?:\..*)?$/i;
const LOCAL_DATA_FILE = /\.(?:log|sqlite|sqlite3|db|pem|key)$/i;

export function parseArea(args) {
  if (args.length !== 1 || (!Object.hasOwn(AREA_PATHS, args[0]) && args[0] !== 'all')) {
    throw new Error(
      `Unknown area "${args.join(' ')}". Expected one of: ${[...Object.keys(AREA_PATHS), 'all'].join(', ')}.`,
    );
  }
  return args[0];
}

function isExcluded(relativePath) {
  const parts = relativePath.split('/');
  const name = parts.at(-1);
  return (
    parts.some((part) => EXCLUDED_DIRECTORIES.has(part)) ||
    (parts.includes('archive') && parts.includes('docs')) ||
    TEST_FILE.test(name) ||
    (ENV_FILE.test(name) && name !== '.env.example') ||
    LOCAL_DATA_FILE.test(name) ||
    relativePath === 'scripts/dump.mjs' ||
    relativePath.startsWith('dumps/')
  );
}

export function isBinary(buffer) {
  if (buffer.includes(0)) return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return false;
  } catch {
    return true;
  }
}

function walk(root, relativeDirectory, files, skippedBinaries) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (isExcluded(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(root, relativePath, files, skippedBinaries);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(path.join(root, relativePath));
      if (isBinary(content)) skippedBinaries.push(relativePath);
      else files.add(relativePath);
    }
  }
}

export function selectPaths(area) {
  const areas = area === 'all' ? Object.keys(AREA_PATHS) : [area];
  return [...new Set([...ROOT_CONFIG_FILES, ...areas.flatMap((name) => AREA_PATHS[name])])].sort();
}

export function collectFiles(root, area) {
  const files = new Set();
  const skippedBinaries = [];
  for (const relativePath of selectPaths(area)) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Required path is missing: ${relativePath}`);
    if (fs.statSync(absolutePath).isDirectory()) walk(root, relativePath, files, skippedBinaries);
    else if (!isExcluded(relativePath)) {
      const content = fs.readFileSync(absolutePath);
      if (isBinary(content)) skippedBinaries.push(relativePath);
      else files.add(relativePath);
    }
  }
  return { files: [...files].sort(), skippedBinaries: skippedBinaries.sort() };
}

function normaliseText(buffer) {
  return buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function writeDump(root, area, date = new Date().toISOString().slice(0, 10)) {
  const { files, skippedBinaries } = collectFiles(root, area);
  const outputDirectory = path.join(root, 'dumps');
  const outputPath = path.join(outputDirectory, `dump_${area}_${date}.txt`);
  if (fs.existsSync(outputPath))
    throw new Error(`Refusing to overwrite existing dump: ${path.relative(root, outputPath)}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const output = files
    .map(
      (relativePath) =>
        `#/${relativePath}\n${normaliseText(fs.readFileSync(path.join(root, relativePath)))}`,
    )
    .join('\n');
  fs.writeFileSync(outputPath, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
  return { outputPath, files, skippedBinaries };
}

export function main(
  args = process.argv.slice(2),
  root = path.resolve(path.dirname(SCRIPT_PATH), '..'),
) {
  const area = parseArea(args);
  const result = writeDump(root, area);
  console.log(
    `Created ${path.relative(root, result.outputPath)} with ${result.files.length} files.`,
  );
  if (result.skippedBinaries.length)
    console.error(`Skipped binary files: ${result.skippedBinaries.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(`dump: ${error.message}`);
    process.exitCode = 1;
  }
}
