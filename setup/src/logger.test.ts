import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModuleLogger } from './logger.js';

test('setup logger preserves nested error causes', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const cause = new Error('exec format error');
  createModuleLogger('test').error(
    { err: new Error('Staff binding failed', { cause }) },
    'Request failed',
  );
  const record = JSON.parse(String(log.mock.calls[0].arguments[0]));
  assert.equal(record.err.message, 'Staff binding failed');
  assert.equal(record.err.cause.message, 'exec format error');
  assert.equal(record.err.cause.stack, cause.stack);
});

test('setup logger handles circular error causes', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const err = new Error('cycle');
  err.cause = err;
  createModuleLogger('test').error({ err }, 'Request failed');
  const record = JSON.parse(String(log.mock.calls[0].arguments[0]));
  assert.equal(record.err.cause, '[Circular error cause]');
});
