import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicketCode, parseTicketCode, formatVisitId, parseVisitId } from '@praxis-flow/flow-core';

test('formatTicketCode: Lane und Sequence', () => {
  assert.equal(formatTicketCode('A', 1), 'A-001');
  assert.equal(formatTicketCode('a', 17), 'A-017');
  assert.equal(formatTicketCode('M', 42), 'M-042');
});

test('parseTicketCode: gueltiges Ticket', () => {
  assert.deepEqual(parseTicketCode('I-001'), { laneCode: 'I', number: 1 });
  assert.deepEqual(parseTicketCode('X-017'), { laneCode: 'X', number: 17 });
});

test('parseTicketCode: Bindestrich optional', () => {
  assert.deepEqual(parseTicketCode('A001'), { laneCode: 'A', number: 1 });
  assert.deepEqual(parseTicketCode('A-001'), { laneCode: 'A', number: 1 });
});

test('formatTicketCode: Sequenz 1000 (variable Breite, wie PF)', () => {
  assert.equal(formatTicketCode('A', 1000), 'A-1000');
  assert.deepEqual(parseTicketCode('A-1000'), { laneCode: 'A', number: 1000 });
});

test('parseTicketCode: ungueltiges Format', () => {
  assert.equal(parseTicketCode('017'), null);
  assert.equal(parseTicketCode('A-'), null);
  assert.equal(parseTicketCode('AA-001'), null);
});

test('formatVisitId: oeffentliche Visit-ID', () => {
  assert.equal(formatVisitId('2026-06-02', 'A', 17), '20260602-A-017');
  assert.deepEqual(parseVisitId('20260602-A-017'), {
    businessDay: '2026-06-02',
    laneCode: 'A',
    number: 17
  });
});
