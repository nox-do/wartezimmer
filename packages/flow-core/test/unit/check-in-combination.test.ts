import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCheckInCombination } from '@praxis-flow/flow-core';

test('assertCheckInCombination: topic oder mfaAssist erforderlich', () => {
  assert.doesNotThrow(() => assertCheckInCombination({ topicId: 'general' }));
  assert.doesNotThrow(() => assertCheckInCombination({ mfaAssist: true }));
  assert.doesNotThrow(() => assertCheckInCombination({ topicId: 'blood', needsAssistance: true }));
});

test('assertCheckInCombination: ungueltige Kombinationen', () => {
  assert.throws(() => assertCheckInCombination({}), /CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED/);
  assert.throws(
    () => assertCheckInCombination({ needsAssistance: true }),
    /CHECKIN_ASSISTANCE_REQUIRES_TOPIC/,
  );
  assert.throws(
    () => assertCheckInCombination({ mfaAssist: true, topicId: 'general' }),
    /CHECKIN_MFA_ASSIST_EXCLUSIVE/,
  );
  assert.doesNotThrow(() => assertCheckInCombination({ mfaAssist: true, needsAssistance: true }));
  assert.throws(
    () => assertCheckInCombination({ topicId: '   ' }),
    /CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED/,
  );
});
