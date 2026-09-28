import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createScannerService } from './scanner-service.js';
import { readFreshclamAttempt, writeFreshclamAttempt } from './freshclam-state.js';

async function fixture(t: test.TestContext, hours: number | null) {
  const dir = await mkdtemp(path.join(tmpdir(), 'scanner-policy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'daily.cvd'), 'test');
  await writeFile(path.join(dir, 'main.cvd'), 'test');
  if (hours !== null)
    await writeFreshclamAttempt(dir, {
      attemptedAt: new Date(Date.now() - hours * 3_600_000).toISOString(),
      ok: true,
      exitCode: 0,
      source: 'startup',
      message: null,
    });
  const calls: string[][] = [];
  const run = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    return { stdout: cmd === 'clamscan' ? 'ClamAV test' : '', stderr: '' };
  };
  const scanner = createScannerService(
    { scanEnabled: true, scannerDbPath: dir, scanTimeoutMs: 1000, maxSignatureAgeHours: 48 },
    run as Parameters<typeof createScannerService>[1],
  );
  return { scanner, calls, dir };
}

for (const hours of [null, 48, 49])
  test(`scan is blocked without a successful check within 48h (${hours})`, async (t) => {
    const { scanner, calls } = await fixture(t, hours);
    assert.equal((await scanner.scanDocumentAtPath('/document.pdf')).status, 'scan_error');
    assert.equal(
      calls.some((args) => args.includes('/document.pdf')),
      false,
    );
  });

test('24h warning still permits scanning and selects the configured database directory', async (t) => {
  const { scanner, calls, dir } = await fixture(t, 25);
  const status = await scanner.readStatus();
  assert.equal(status.updateWarning, true);
  assert.equal(status.ready, true);
  assert.equal((await scanner.scanDocumentAtPath('/document.pdf')).status, 'clean');
  assert.ok(
    calls.some(
      (args) => args.includes('--database') && args.includes(dir) && args.includes('/document.pdf'),
    ),
  );
});

test('failed update preserves the last successful check; no-change success refreshes it', async (t) => {
  const { scanner, dir } = await fixture(t, 25);
  const previous = (await readFreshclamAttempt(dir))!.lastSuccessfulCheckAt;
  await writeFreshclamAttempt(dir, {
    attemptedAt: new Date().toISOString(),
    ok: false,
    exitCode: 1,
    source: 'scheduled',
    message: 'offline',
  });
  assert.equal((await readFreshclamAttempt(dir))!.lastSuccessfulCheckAt, previous);
  await scanner.updateSignatures();
  assert.notEqual((await readFreshclamAttempt(dir))!.lastSuccessfulCheckAt, previous);
  assert.equal((await scanner.readStatus()).updateWarning, false);
});

test('recent check cannot mask missing signature files', async (t) => {
  const { scanner, dir } = await fixture(t, 1);
  await rm(path.join(dir, 'daily.cvd'));
  assert.equal((await scanner.readStatus()).ready, false);
});

test('concurrent updates share one updater and a failed attempt preserves currency', async (t) => {
  const { dir } = await fixture(t, 25);
  const previous = (await readFreshclamAttempt(dir))!.lastSuccessfulCheckAt;
  let fail = true;
  let updates = 0;
  const run = async () => {
    updates++;
    if (fail) throw new Error('offline');
    return { stdout: 'already up-to-date', stderr: '' };
  };
  const scanner = createScannerService(
    { scanEnabled: true, scannerDbPath: dir, scanTimeoutMs: 1000, maxSignatureAgeHours: 48 },
    run as Parameters<typeof createScannerService>[1],
  );
  const first = scanner.updateSignatures('scheduled');
  const second = scanner.updateSignatures('manual');
  assert.equal(first, second);
  await assert.rejects(first, /offline/);
  assert.equal(updates, 1);
  const failed = (await readFreshclamAttempt(dir))!;
  assert.equal(failed.lastSuccessfulCheckAt, previous);
  assert.equal(failed.ok, false);
  fail = false;
  await scanner.updateSignatures('scheduled');
  assert.equal(updates, 2);
  assert.equal((await readFreshclamAttempt(dir))!.ok, true);
  assert.notEqual((await readFreshclamAttempt(dir))!.lastSuccessfulCheckAt, previous);
});
