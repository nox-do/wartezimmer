import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCheckInBody } from '@wartezimmer/flow-core';

test('parseCheckInBody: normalisiert gueltige Check-in-Bodies', () => {
  assert.deepEqual(parseCheckInBody({ topicId: 'general' }), {
    topicId: 'general',
    mfaAssist: false,
    authPath: 'phone_dob',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: false,
    staffNote: undefined,
  });

  assert.deepEqual(parseCheckInBody({ mfaAssist: true }), {
    topicId: undefined,
    mfaAssist: true,
    authPath: 'none',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: false,
    staffNote: undefined,
  });

  assert.deepEqual(parseCheckInBody({ topicId: 'blood', needsAssistance: true, authPath: 'egk' }), {
    topicId: 'blood',
    mfaAssist: false,
    authPath: 'egk',
    surfaceId: 'terminal_1',
    displayName: undefined,
    needsAssistance: true,
    staffNote: undefined,
  });
});
