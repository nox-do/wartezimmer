import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTicketCode, parseTicketCode } from './ticket-code.js';

test('formatTicketCode uppercases lane and zero-pads number', () => {
  assert.equal(formatTicketCode('o', 1), 'O-001');
  assert.equal(formatTicketCode('A', 12), 'A-012');
  assert.equal(formatTicketCode('a', 17), 'A-017');
});

test('formatTicketCode: sequence 1000 uses variable width', () => {
  assert.equal(formatTicketCode('A', 1000), 'A-1000');
});

test('parseTicketCode: valid ticket', () => {
  assert.deepEqual(parseTicketCode('I-001'), { laneCode: 'I', number: 1 });
  assert.deepEqual(parseTicketCode('X-017'), { laneCode: 'X', number: 17 });
  assert.deepEqual(parseTicketCode('A-1000'), { laneCode: 'A', number: 1000 });
});

test('parseTicketCode: hyphen optional', () => {
  assert.deepEqual(parseTicketCode('A001'), { laneCode: 'A', number: 1 });
  assert.deepEqual(parseTicketCode('A-001'), { laneCode: 'A', number: 1 });
});

test('parseTicketCode: invalid format', () => {
  assert.equal(parseTicketCode('017'), null);
  assert.equal(parseTicketCode('A-'), null);
  assert.equal(parseTicketCode('AA-001'), null);
});
