import assert from 'node:assert/strict';
import test from 'node:test';
import { createHostMutationLock } from './host-mutation-lock.js';

test('host mutation lock rejects overlap and releases after completion', async () => {
  const lock = createHostMutationLock();
  let release!: () => void;
  const first = lock.run(
    'restricted apply',
    () => new Promise<string>((resolve) => (release = () => resolve('done'))),
  );

  await assert.rejects(
    () => lock.run('TLS apply', async () => 'unexpected'),
    /Hoständerung läuft bereits \(restricted apply\)/,
  );
  release();
  assert.equal(await first, 'done');
  assert.equal(await lock.run('TLS apply', async () => 'next'), 'next');
});

test('host mutation lock releases after a failed operation', async () => {
  const lock = createHostMutationLock();
  await assert.rejects(
    () =>
      lock.run('setup apply', async () => {
        throw new Error('failed');
      }),
    /failed/,
  );
  assert.equal(await lock.run('restricted remove', async () => 'recovered'), 'recovered');
});
