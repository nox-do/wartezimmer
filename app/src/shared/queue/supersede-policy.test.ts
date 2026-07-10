import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSupersedeAllowed } from './supersede-policy.js';
import { DomainError } from '../errors/domain-error.js';

function assertThrowsDomain(fn: () => void, code: string) {
  assert.throws(fn, (error: unknown) => error instanceof DomainError && error.domainCode === code);
}

test('assertSupersedeAllowed: waiting und directed ok', () => {
  for (const coreStatus of ['waiting', 'directed']) {
    assert.doesNotThrow(() =>
      assertSupersedeAllowed({
        coreStatus,
        absentMode: null,
        sourceTopicId: 'mfa',
        targetTopicId: 'general',
        targetTopicEnabled: true,
      }),
    );
  }
});

test('assertSupersedeAllowed: blocked/called/… abgelehnt', () => {
  for (const coreStatus of ['blocked', 'called', 'arrived', 'in_progress', 'done']) {
    assertThrowsDomain(
      () =>
        assertSupersedeAllowed({
          coreStatus,
          absentMode: null,
          sourceTopicId: 'mfa',
          targetTopicId: 'general',
          targetTopicEnabled: true,
        }),
      'INVALID_TRANSITION',
    );
  }
});

test('assertSupersedeAllowed: absent overlay abgelehnt', () => {
  assertThrowsDomain(
    () =>
      assertSupersedeAllowed({
        coreStatus: 'waiting',
        absentMode: 'wait_here',
        sourceTopicId: 'mfa',
        targetTopicId: 'general',
        targetTopicEnabled: true,
      }),
    'INVALID_TRANSITION',
  );
});

test('assertSupersedeAllowed: gleiches Topic / disabled Ziel', () => {
  assertThrowsDomain(
    () =>
      assertSupersedeAllowed({
        coreStatus: 'waiting',
        sourceTopicId: 'general',
        targetTopicId: 'general',
        targetTopicEnabled: true,
      }),
    'INVALID_TRANSITION',
  );
  assertThrowsDomain(
    () =>
      assertSupersedeAllowed({
        coreStatus: 'waiting',
        sourceTopicId: 'mfa',
        targetTopicId: 'general',
        targetTopicEnabled: false,
      }),
    'TOPIC_DISABLED',
  );
});
