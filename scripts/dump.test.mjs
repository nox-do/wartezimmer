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
    'docs/architecture',
  ])
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  for (const name of [
    'README.md',
    'docs/flows.md',
    'docs/architecture/README.md',
    'docs/architecture/apis.md',
    'docs/architecture/domain.md',
    'docs/architecture/realtime.md',
    'docs/architecture/routing.md',
    'docs/architecture/system.md',
  ])
    fs.writeFileSync(path.join(root, name), '# Fixture\n');
  return root;
}
function write(root, name, value = 'export const value = 1;\r\n') {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), value);
}

test('parses known areas and rejects unknown arguments', () => {
  assert.equal(parseArea(['manager']), 'manager');
  assert.equal(parseArea(['review']), 'review');
  assert.throws(() => parseArea([]), /Unknown area/);
  assert.throws(() => parseArea(['nope']), /Unknown area/);
});

test('review selection is focused, deterministic, and includes evidence tests', () => {
  const paths = selectPaths('review');
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes('app/src/shared/documents/filesystem-export.ts'));
  assert.ok(paths.includes('app/src/shared/documents/filesystem-export.test.ts'));
  assert.ok(paths.includes('app/src/shared/sandbox/sandbox-intake-gate.test.ts'));
  assert.ok(!paths.includes('package-lock.json'));
});

test('all selection is unique and deterministic', () => {
  const paths = selectPaths('all');
  assert.deepEqual(paths, [...paths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes('manager'));
  assert.ok(paths.includes('packages/flow-core'));
});

test('core selection contains the host, UI, contracts, architecture and shared packages', () => {
  const paths = selectPaths('core');
  for (const expected of [
    'app',
    'ui',
    'openapi',
    'packages/domain',
    'packages/flow-core',
    'packages/server-shared',
    'docs/architecture/system.md',
  ])
    assert.ok(paths.includes(expected), `missing ${expected}`);
  assert.ok(!paths.includes('package-lock.json'));
});

test('excludes tests, artifacts, secrets and binary files', () => {
  const root = fixture();
  write(root, 'manager/src/keep.ts');
  write(root, 'manager/src/keep.test.ts');
  write(root, 'manager/src/keep.spec.ts');
  write(root, 'manager/test/helper.ts');
  write(root, 'manager/dist/built.js');
  write(root, 'manager/src/generated/client.ts');
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

test('excludes the generated OpenAPI bundle but keeps source contracts', () => {
  const root = fixture();
  write(root, 'openapi/bundle.json', '{}');
  write(root, 'openapi/queue.yaml', 'openapi: 3.1.0\n');
  const result = collectFiles(root, 'core');
  assert.ok(!result.files.includes('openapi/bundle.json'));
  assert.ok(result.files.includes('openapi/queue.yaml'));
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

test('review dump places decision context before each selected file', () => {
  const root = fixture();
  for (const relativePath of selectPaths('review')) write(root, relativePath);

  const result = writeDump(root, 'review', '2026-09-22');
  const output = fs.readFileSync(result.outputPath, 'utf8');
  assert.match(output, /^# Wartezimmer focused remediation review/m);
  assert.match(
    output,
    /#\/app\/src\/shared\/documents\/filesystem-export\.ts\n# REVIEW-NOTE: F-01:/,
  );
  assert.match(
    output,
    /#\/app\/src\/shared\/sandbox\/sandbox-intake-gate\.test\.ts\n# REVIEW-NOTE: Day-reset follow-up:/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('binary guard recognizes NUL bytes', () => {
  assert.equal(isBinary(Buffer.from('text')), false);
  assert.equal(isBinary(Buffer.from([116, 0, 120])), true);
  assert.equal(isBinary(Buffer.from([0xff, 0xfe])), true);
});
