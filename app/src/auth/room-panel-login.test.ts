import assert from 'node:assert/strict';
import test from 'node:test';
import { roomPanelRequiresPin } from './room-panel-login.js';

test('roomPanelRequiresPin follows the physical placement', () => {
  assert.equal(roomPanelRequiresPin('outside'), false);
  assert.equal(roomPanelRequiresPin('inside'), true);
});
