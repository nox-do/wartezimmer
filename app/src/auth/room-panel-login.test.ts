import assert from 'node:assert/strict';
import test from 'node:test';
import { roomPanelRequiresPin } from '@praxis-flow/domain';

test('roomPanelRequiresPin follows the physical placement', () => {
  assert.equal(roomPanelRequiresPin('outside'), false);
  assert.equal(roomPanelRequiresPin('inside'), true);
});
