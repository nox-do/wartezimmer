import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCheckInBody } from '@praxis-flow/flow-core';

test('parseCheckInBody: topicId oder mfaAssist', () => {
  assert.deepEqual(parseCheckInBody({ topicId: 'general' }), {
    topicId: 'general',
    mfaAssist: false,
    authPath: 'phone_dob',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: false,
    staffNote: undefined
  });

  assert.deepEqual(parseCheckInBody({ mfaAssist: true }), {
    topicId: undefined,
    mfaAssist: true,
    authPath: 'mfa_assist',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: false,
    staffNote: undefined
  });

  assert.deepEqual(parseCheckInBody({ topicId: 'blood', needsAssistance: true, authPath: 'egk' }), {
    topicId: 'blood',
    mfaAssist: false,
    authPath: 'egk',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: true,
    staffNote: undefined
  });
});

test('parseCheckInBody: ungueltige Kombinationen', () => {
  assert.throws(() => parseCheckInBody({}), /CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED/);
  assert.throws(() => parseCheckInBody({ needsAssistance: true }), /CHECKIN_ASSISTANCE_REQUIRES_TOPIC/);
  assert.throws(
    () => parseCheckInBody({ mfaAssist: true, topicId: 'general' }),
    /CHECKIN_MFA_ASSIST_EXCLUSIVE/
  );
  assert.throws(
    () => parseCheckInBody({ mfaAssist: true, needsAssistance: true }),
    /CHECKIN_MFA_ASSIST_EXCLUSIVE/
  );
});
