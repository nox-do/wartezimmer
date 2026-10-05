import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { restrictedDiagnostic, withRestrictedDiagnostics } from './restricted-diagnostics.js';

function fixture(t: test.TestContext) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-beta-log-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home, file: path.join(home, 'logs/restricted-beta.jsonl') };
}

test('diagnostics correlate nested operations and preserve failures without leaking error text', async (t) => {
  const { home, file } = fixture(t);
  const failure = new Error('AUTH_KEY=secret');
  await assert.rejects(
    withRestrictedDiagnostics(home, 'apply', async () => {
      await withRestrictedDiagnostics(home, 'compose-up', async () => {
        restrictedDiagnostic('listener.probe', { ok: false, status: 404 });
      });
      throw failure;
    }),
    (error) => error === failure,
  );
  const raw = fs.readFileSync(file, 'utf8');
  const rows = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.map((row) => row.event),
    ['operation.begin', 'listener.probe', 'operation.end'],
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, 1);
  assert.equal(rows.at(-1).ok, false);
  assert.ok(!raw.includes('secret'));
});

test('diagnostics rotate at two MiB and keep a single previous file', async (t) => {
  const { home, file } = fixture(t);
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, 'x'.repeat(2 * 1024 * 1024));
  fs.writeFileSync(`${file}.1`, 'older');
  await withRestrictedDiagnostics(home, 'apply', async () => {});
  assert.equal(fs.statSync(`${file}.1`).size, 2 * 1024 * 1024);
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
});

test('an unwritable diagnostic destination never changes the operation result', async (t) => {
  const { home } = fixture(t);
  fs.writeFileSync(path.join(home, 'logs'), 'not a directory');
  t.mock.method(console, 'error', () => {});
  assert.equal(await withRestrictedDiagnostics(home, 'remove', async () => 42), 42);
});

test('returned failures are not logged as success; unclassified returns stay unknown', async (t) => {
  const { home, file } = fixture(t);
  for (const result of [{ ok: false }, { ok: true }, undefined]) {
    await withRestrictedDiagnostics(home, 'result', async () => result);
  }
  const ends = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((row) => row.event === 'operation.end');
  assert.deepEqual(
    ends.map((row) => [row.completion, row.ok]),
    [
      ['returned', false],
      ['returned', true],
      ['returned', null],
    ],
  );
});

test('host operations retain the context after nested compose and during rollback', async (t) => {
  const { hostMutationLock } = await import('./host-mutation-lock.js');
  const { home, file } = fixture(t);
  await hostMutationLock(home).run('restore', async () => {
    restrictedDiagnostic('recovery.before-compose', {});
    await withRestrictedDiagnostics(home, 'compose-up', async () => ({ ok: true }));
    restrictedDiagnostic('runtime.audit', { ok: false });
    await hostMutationLock(home).run('rollback', async () => {
      restrictedDiagnostic('rollback.end', { ok: true });
    });
    return { ok: false };
  });
  const rows = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.map((row) => row.event),
    [
      'operation.begin',
      'recovery.before-compose',
      'runtime.audit',
      'rollback.end',
      'operation.end',
    ],
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, 1);
  assert.equal(rows.at(-1).ok, false);
});

test('overlapping diagnostic operations retain separate IDs across rotation', async (t) => {
  const { home, file } = fixture(t);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withRestrictedDiagnostics(home, 'first', async () => {
    await barrier;
    restrictedDiagnostic('first.probe', {});
    return { ok: false };
  });
  await withRestrictedDiagnostics(home, 'second', async () => {
    restrictedDiagnostic('rotation.fill', { padding: 'x'.repeat(2 * 1024 * 1024 - 500) });
    restrictedDiagnostic('second.probe', { padding: 'x'.repeat(600) });
    release();
    await first;
    return { ok: true };
  });
  const rows = [file + '.1', file].flatMap((name) =>
    fs
      .readFileSync(name, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  );
  const firstId = rows.find((row) => row.action === 'first').id;
  const secondId = rows.find((row) => row.action === 'second').id;
  assert.notEqual(firstId, secondId);
  assert.equal(rows.find((row) => row.event === 'first.probe').id, firstId);
  assert.equal(rows.find((row) => row.event === 'second.probe').id, secondId);
  assert.ok(fs.statSync(file).size <= 2 * 1024 * 1024);
  assert.ok(fs.statSync(file + '.1').size <= 2 * 1024 * 1024);
});
