import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectFiles, isBinary, parseArea, selectPaths, writeDump } from './dump.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-dump-'));
  for (const name of [
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    'eslint.config.js',
    'prettier.config.cjs',
    'stylelint.config.js',
    '.editorconfig',
    '.gitignore',
  ])
    fs.writeFileSync(path.join(root, name), '{}');
  for (const directory of [
    'manager',
    'packages/domain',
    'packages/flow-core',
    'packages/server-shared',
    'app',
    'sandbox',
    'ui',
    'setup',
    'scripts',
    'proxy',
    'openapi',
  ])
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  return root;
}
function write(root, name, value = 'export const value = 1;\r\n') {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), value);
}

test('parses known areas and rejects unknown arguments', () => {
  assert.equal(parseArea(['manager']), 'manager');
  assert.throws(() => parseArea([]), /Unknown area/);
  assert.throws(() => parseArea(['nope']), /Unknown area/);
});

test('all selection is unique and deterministic', () => {
  const paths = selectPaths('all');
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes('manager'));
  assert.ok(paths.includes('packages/flow-core'));
});

test('excludes tests, artifacts, secrets and binary files', () => {
  const root = fixture();
  write(root, 'manager/src/keep.ts');
  write(root, 'manager/src/keep.test.ts');
  write(root, 'manager/src/keep.spec.ts');
  write(root, 'manager/test/helper.ts');
  write(root, 'manager/dist/built.js');
  write(root, 'manager/.env', 'PASSWORD=secret');
  write(root, 'manager/.env.backup-1', 'PASSWORD=secret');
  write(root, 'manager/runtime.sqlite', 'local database');
  write(root, 'manager/runtime.log', 'local log');
  write(root, 'manager/.env.example', 'PASSWORD=example');
  write(root, 'manager/static/icon.ico', Buffer.from([0, 1, 2]));
  const result = collectFiles(root, 'manager');
  assert.deepEqual(
    result.files.filter((file) => file.startsWith('manager/')),
    ['manager/.env.example', 'manager/src/keep.ts'],
  );
  assert.deepEqual(result.skippedBinaries, ['manager/static/icon.ico']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('writes sorted headers, normalizes CRLF, and will not overwrite', () => {
  const root = fixture();
  write(root, 'manager/src/z.ts', 'z\r\n');
  write(root, 'manager/src/a.ts', 'a\r\n');
  const result = writeDump(root, 'manager', '2026-09-10');
  const output = fs.readFileSync(result.outputPath, 'utf8');
  const headers = [...output.matchAll(/^#\/(.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headers, [...headers].sort());
  assert.match(output, /#\/manager\/src\/a\.ts\na\n/);
  assert.doesNotMatch(output, /\r/);
  assert.throws(() => writeDump(root, 'manager', '2026-09-10'), /Refusing to overwrite/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('binary guard recognizes NUL bytes', () => {
  assert.equal(isBinary(Buffer.from('text')), false);
  assert.equal(isBinary(Buffer.from([116, 0, 120])), true);
  assert.equal(isBinary(Buffer.from([0xff, 0xfe])), true);
});
