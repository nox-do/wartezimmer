import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidConfigurableTopicId, slugifyTopicId } from './topic-id.js';

test('isValidConfigurableTopicId rejects reserved mfa id', () => {
  assert.equal(isValidConfigurableTopicId('mfa'), false);
  assert.equal(isValidConfigurableTopicId('rezept'), true);
});

test('slugifyTopicId deduplicates against taken set', () => {
  const taken = new Set(['rezept']);
  assert.equal(slugifyTopicId('Rezept', taken), 'rezept-2');
});
