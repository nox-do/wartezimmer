import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecallNotifyPhone } from './recall-notify-phone.js';

test('resolveRecallNotifyPhone prefers callbackPhone over checkinPhone', () => {
  assert.equal(resolveRecallNotifyPhone('491701111111', '491702222222'), '491701111111');
});

test('resolveRecallNotifyPhone falls back to checkinPhone', () => {
  assert.equal(resolveRecallNotifyPhone(null, '491702222222'), '491702222222');
  assert.equal(resolveRecallNotifyPhone('  ', '491702222222'), '491702222222');
});

test('resolveRecallNotifyPhone returns null when no number', () => {
  assert.equal(resolveRecallNotifyPhone(null, null), null);
  assert.equal(resolveRecallNotifyPhone('', ''), null);
});
