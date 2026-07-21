import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import { parseRedirectBody } from '@praxis-flow/flow-core';

function testRuntime() {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db) };
}

test('parseRedirectBody: actorId wird nicht übernommen', () => {
  const body = parseRedirectBody({
    movementMode: 'call',
    publicDisplayMode: 'visible',
    actorId: 'client-fake',
    actorSurfaceId: 'mfa_dashboard',
  });

  assert.equal(body.movementMode, 'call');
  assert.equal(body.actorSurfaceId, 'mfa_dashboard');
  assert.equal('actorId' in body, false);
});

test('redirect contract: HTTP-Pfad liefert kein actorId, Host-Kontext schon', () => {
  const { runtime } = testRuntime();
  const httpVisit = runtime.checkIn({
    topicId: 'general',
    displayName: 'HttpPath',
    surfaceId: 'terminal_1',
  });
  const hostVisit = runtime.checkIn({
    topicId: 'general',
    displayName: 'HostPath',
    surfaceId: 'terminal_1',
  });

  const httpBody = parseRedirectBody({
    movementMode: 'pickup',
    publicDisplayMode: 'hidden',
    actorId: 'client-fake',
  });
  runtime.redirect(httpVisit!.id, httpBody);

  runtime.redirect(
    hostVisit!.id,
    {
      movementMode: 'pickup',
      publicDisplayMode: 'hidden',
    },
    { actorId: 'staff-session-1' },
  );

  const httpRedirected = runtime.events(httpVisit!.id).find((event) => event.type === 'redirected');
  const hostRedirected = runtime.events(hostVisit!.id).find((event) => event.type === 'redirected');

  assert.equal(httpRedirected?.actorId, undefined);
  assert.equal(hostRedirected?.actorId, 'staff-session-1');
});
