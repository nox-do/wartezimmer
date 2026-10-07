import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStackVersion } from './stack-version.js';

test('resolveStackVersion returns trimmed env value', () => {
  assert.equal(resolveStackVersion({ WARTEZIMMER_STACK_VERSION: ' 2.1.0 ' }), '2.1.0');
});

test('resolveStackVersion returns null when unset or blank', () => {
  assert.equal(resolveStackVersion({}), null);
  assert.equal(resolveStackVersion({ WARTEZIMMER_STACK_VERSION: '  ' }), null);
});
