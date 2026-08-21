import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVisitId, parseVisitId } from '@praxis-flow/flow-core';

test('formatVisitId: oeffentliche Visit-ID', () => {
  assert.equal(formatVisitId('2026-06-02', 'A', 17), '20260602-A-017');
  assert.deepEqual(parseVisitId('20260602-A-017'), {
    businessDay: '2026-06-02',
    laneCode: 'A',
    number: 17,
  });
});
