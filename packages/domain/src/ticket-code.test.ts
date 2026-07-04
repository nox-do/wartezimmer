import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTicketCode } from './ticket-code.js';

test('formatTicketCode uppercases lane and zero-pads number', () => {
  assert.equal(formatTicketCode('o', 1), 'O-001');
  assert.equal(formatTicketCode('A', 12), 'A-012');
});
