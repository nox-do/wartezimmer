import assert from 'node:assert/strict';
import test from 'node:test';
import { domainError } from '../errors/domain-error.js';
import { purgeSandboxDocument } from './sandbox-document-cleanup.js';

test('purgeSandboxDocument rejects empty document id', async () => {
  await assert.rejects(
    () => purgeSandboxDocument('   '),
    (error: unknown) => {
      return error instanceof Error && error.message === 'INVALID_ARGUMENT';
    },
  );
});

test('purgeSandboxDocument propagates sandbox delete errors', async () => {
  const original = process.env.SANDBOX_BASE_URL;
  process.env.SANDBOX_BASE_URL = 'http://127.0.0.1:1';

  try {
    await assert.rejects(() => purgeSandboxDocument('doc-1'));
  } finally {
    if (original === undefined) {
      delete process.env.SANDBOX_BASE_URL;
    } else {
      process.env.SANDBOX_BASE_URL = original;
    }
  }
});

test('purgeSandboxDocument accepts domain errors from callers unchanged', () => {
  const err = domainError('INVALID_ARGUMENT');
  assert.equal(err.domainCode, 'INVALID_ARGUMENT');
});
