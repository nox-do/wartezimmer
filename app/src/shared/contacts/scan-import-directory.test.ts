import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanImportDirectory } from './scan-import-directory.js';

test('import scan finds nested mixed-case CSV, ignores hidden entries and stops symlink cycles', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-import-scan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'Patienten'));
  await fs.mkdir(path.join(root, '.hidden'));
  for (const name of [
    'Patienten/Kontakte.CSV',
    'liste.csv',
    '.hidden/privat.csv',
    '.hidden.csv',
    'ignore.txt',
  ])
    await fs.writeFile(path.join(root, name), 'fixture');
  await fs.symlink(
    root,
    path.join(root, 'Patienten/cycle'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await fs.symlink(
    path.join(root, 'Patienten'),
    path.join(root, 'alias'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = await scanImportDirectory(root);
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  assert.deepEqual(
    result.files.map(relative).sort(),
    ['Patienten/Kontakte.CSV', 'alias/Kontakte.CSV', 'liste.csv'].sort(),
  );
  assert.deepEqual(result.directories.map(relative).sort(), ['Patienten', 'alias'].sort());
});
