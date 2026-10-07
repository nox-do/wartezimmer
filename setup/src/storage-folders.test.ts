import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeHostFolderPath,
  resolveStorageFoldersFromSources,
  writeStorageFolders,
} from './storage-folders.js';
import { readEnvMap } from './env-file.js';
import type { SetupContext } from './setup-context.js';

test('normalizeHostFolderPath expands ~ and normalizes absolute paths', () => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  assert.equal(
    normalizeHostFolderPath('~/wartezimmer-imports'),
    path.join(home, 'wartezimmer-imports'),
  );
  assert.equal(
    normalizeHostFolderPath('/tmp/wartezimmer-exports'),
    path.normalize('/tmp/wartezimmer-exports'),
  );
});

test('normalizeHostFolderPath rejects empty and relative values', () => {
  assert.throws(() => normalizeHostFolderPath('   '), /INVALID_FOLDER_PATH/);
  assert.throws(() => normalizeHostFolderPath('relative/imports'), /INVALID_FOLDER_PATH/);
});

test('resolveStorageFoldersFromSources prefers process env over .env map', () => {
  const previousImports = process.env.IMPORTS_HOST_PATH;
  const previousExports = process.env.EXPORTS_HOST_PATH;
  process.env.IMPORTS_HOST_PATH = '/env/imports';
  process.env.EXPORTS_HOST_PATH = '/env/exports';
  try {
    const envMap = new Map([
      ['IMPORTS_HOST_PATH', '/file/imports'],
      ['EXPORTS_HOST_PATH', '/file/exports'],
    ]);
    assert.deepEqual(resolveStorageFoldersFromSources({ envMap }), {
      imports: '/env/imports',
      exports: '/env/exports',
    });
  } finally {
    if (previousImports === undefined) {
      delete process.env.IMPORTS_HOST_PATH;
    } else {
      process.env.IMPORTS_HOST_PATH = previousImports;
    }
    if (previousExports === undefined) {
      delete process.env.EXPORTS_HOST_PATH;
    } else {
      process.env.EXPORTS_HOST_PATH = previousExports;
    }
  }
});

test('resolveStorageFoldersFromSources expands ~ from env map', () => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const envMap = new Map([
    ['IMPORTS_HOST_PATH', '~/wartezimmer-imports'],
    ['EXPORTS_HOST_PATH', '~/wartezimmer-exports'],
  ]);
  assert.deepEqual(resolveStorageFoldersFromSources({ envMap }), {
    imports: path.join(home, 'wartezimmer-imports'),
    exports: path.join(home, 'wartezimmer-exports'),
  });
});

test('writeStorageFolders updates env keys and creates directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-storage-'));
  const envPath = path.join(root, '.env');
  fs.writeFileSync(
    envPath,
    'IMPORTS_HOST_PATH=/old/imports\nEXPORTS_HOST_PATH=/old/exports\n',
    'utf8',
  );

  const ctx: SetupContext = {
    home: root,
    mode: 'repo',
    composeProjectName: 'pf-test',
    templateRoot: root,
  };

  const imports = path.join(root, 'imports');
  const exportsDir = path.join(root, 'exports');
  const result = writeStorageFolders(ctx, { imports, exports: exportsDir });

  assert.equal(result.folders.imports, imports);
  assert.equal(result.folders.exports, exportsDir);
  assert.ok(fs.existsSync(imports));
  assert.ok(fs.existsSync(exportsDir));
  assert.deepEqual(result.created.sort(), [exportsDir, imports].sort());

  const env = readEnvMap(envPath);
  assert.equal(env.get('IMPORTS_HOST_PATH'), imports);
  assert.equal(env.get('EXPORTS_HOST_PATH'), exportsDir);
  assert.ok(result.backupPath && fs.existsSync(result.backupPath));
});

test('writeStorageFolders rejects existing files as folder paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-storage-file-'));
  const envPath = path.join(root, '.env');
  fs.writeFileSync(
    envPath,
    'IMPORTS_HOST_PATH=/old/imports\nEXPORTS_HOST_PATH=/old/exports\n',
    'utf8',
  );

  const ctx: SetupContext = {
    home: root,
    mode: 'repo',
    composeProjectName: 'pf-test',
    templateRoot: root,
  };

  const importsFile = path.join(root, 'imports-file');
  fs.writeFileSync(importsFile, 'not a directory', 'utf8');

  assert.throws(
    () => writeStorageFolders(ctx, { imports: importsFile, exports: path.join(root, 'exports') }),
    /FOLDER_PATH_NOT_DIRECTORY/,
  );
});
