import assert from 'node:assert/strict';
import test from 'node:test';
import { domainError } from '../shared/errors/domain-error.js';
import { isExpectedDomainError, resolveDomainError } from './domain-error-codes.js';

test('resolveDomainError maps DomainError and plain Error session codes to 4xx', () => {
  const sessionUnauthorized = resolveDomainError(domainError('SESSION_UNAUTHORIZED'));
  assert.equal(sessionUnauthorized?.http?.status, 401);
  assert.equal(sessionUnauthorized?.code, 'SESSION_UNAUTHORIZED');

  const documentForbidden = resolveDomainError(new Error('DOCUMENT_FORBIDDEN'));
  assert.equal(documentForbidden?.http?.status, 403);
  assert.equal(documentForbidden?.code, 'DOCUMENT_FORBIDDEN');
});

test('CHECKIN_LOCKED uses consistent 409 status', () => {
  const resolved = resolveDomainError(domainError('CHECKIN_LOCKED'));
  assert.equal(resolved?.http?.status, 409);
  assert.equal(resolved?.code, 'CHECKIN_LOCKED');
});

test('resolveDomainError maps prefixed messaging provider codes', () => {
  const resolved = resolveDomainError(new Error('UNKNOWN_MESSAGING_PROVIDER:missing'));
  assert.equal(resolved?.http?.status, 400);
  assert.equal(resolved?.code, 'UNKNOWN_MESSAGING_PROVIDER');
});

test('resolveDomainError maps sandbox failures to SANDBOX_UNAVAILABLE', () => {
  const resolved = resolveDomainError(new Error('SANDBOX_PREVIEW_UNREACHABLE'));
  assert.equal(resolved?.http?.status, 502);
  assert.equal(resolved?.code, 'SANDBOX_UNAVAILABLE');
});

test('isExpectedDomainError recognizes mapped and prefixed domain codes', () => {
  assert.equal(isExpectedDomainError('SESSION_ALREADY_ACTIVE'), true);
  assert.equal(isExpectedDomainError('TICKET_LOOKUP_REQUIRED'), true);
  assert.equal(isExpectedDomainError('UNKNOWN_MESSAGING_PROVIDER:foo'), true);
  assert.equal(isExpectedDomainError('SANDBOX_PREVIEW_UNREACHABLE'), true);
});

test('resolveDomainError returns null http mapping for unknown errors', () => {
  const resolved = resolveDomainError(new Error('OUTBOX_UNSUPPORTED_EVENT_TYPE:foo'));
  assert.equal(resolved?.http, null);
  assert.equal(resolved?.code, 'UNKNOWN_ERROR');
});
