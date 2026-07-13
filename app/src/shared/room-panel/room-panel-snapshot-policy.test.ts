import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRoomPanelCallCandidateVisit,
  resolveRoomPanelCallCandidateScope,
} from './room-panel-snapshot-policy.js';

test('isRoomPanelCallCandidateVisit accepts waiting/directed call hops targeting the room', () => {
  assert.equal(
    isRoomPanelCallCandidateVisit(
      { status: 'waiting', movementMode: 'call', targetLocationId: 'labor' },
      'labor',
    ),
    true,
  );
  assert.equal(
    isRoomPanelCallCandidateVisit(
      { status: 'directed', movementMode: 'call', targetLocationId: 'labor' },
      'labor',
    ),
    true,
  );
});

test('resolveRoomPanelCallCandidateScope rejects non-call movement and wrong room', () => {
  assert.equal(
    resolveRoomPanelCallCandidateScope(
      { status: 'waiting', movementMode: 'pickup', targetLocationId: 'labor' },
      'labor',
    ),
    'INVALID_TRANSITION',
  );
  assert.equal(
    resolveRoomPanelCallCandidateScope(
      { status: 'waiting', movementMode: 'call', targetLocationId: 'empfang' },
      'labor',
    ),
    'ROOM_MISMATCH',
  );
  assert.equal(resolveRoomPanelCallCandidateScope(undefined, 'labor'), 'VISIT_NOT_FOUND');
});
