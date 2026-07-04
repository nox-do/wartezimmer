import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTopicEditable } from '@praxis-flow/flow-core';

test('assertTopicEditable: blockiert bei offenen Visits', () => {
  assert.throws(() => assertTopicEditable({ openVisitCount: 1 }), /TOPIC_LOCKED/);
  assert.doesNotThrow(() => assertTopicEditable({ openVisitCount: 0 }));
});
