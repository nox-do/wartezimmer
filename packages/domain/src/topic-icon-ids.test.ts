import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTopicIconId, normalizeTopicIconId, TOPIC_ICON_IDS } from './topic-icon-ids.js';

test('TOPIC_ICON_IDS has unique kebab-case ids', () => {
  assert.equal(new Set(TOPIC_ICON_IDS).size, TOPIC_ICON_IDS.length);
  for (const id of TOPIC_ICON_IDS) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test('normalizeTopicIconId accepts allowlisted ids and nulls others', () => {
  assert.equal(normalizeTopicIconId('stethoscope'), 'stethoscope');
  assert.equal(normalizeTopicIconId('  heart-pulse  '), 'heart-pulse');
  assert.equal(normalizeTopicIconId(''), null);
  assert.equal(normalizeTopicIconId(null), null);
  assert.equal(normalizeTopicIconId('not-an-icon'), null);
  assert.equal(isValidTopicIconId('syringe'), true);
  assert.equal(isValidTopicIconId('nope'), false);
});
