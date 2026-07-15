import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import { parseTransitionBody } from '@praxis-flow/flow-core';

function testRuntime() {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db) };
}

test('parseTransitionBody: actorSurfaceId und actorId werden nicht übernommen', () => {
  const body = parseTransitionBody({
    actingLocationId: 'room_1',
    targetLocationId: 'lab',
    actorSurfaceId: 'mfa_dashboard',
    actorId: 'client-fake',
  });

  assert.equal(body.actingLocationId, 'room_1');
  assert.equal(body.targetLocationId, 'lab');
  assert.equal('actorSurfaceId' in body, false);
  assert.equal('actorId' in body, false);
});

test('transition contract: HTTP-Pfad liefert kein actorId, Host-Kontext schon', () => {
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

  const httpContext = parseTransitionBody({
    actorSurfaceId: 'mfa_dashboard',
    actorId: 'client-fake',
  });
  runtime.transition(httpVisit!.id, 'call', httpContext);

  runtime.transition(hostVisit!.id, 'call', { actorId: 'staff-session-1' });

  const httpCalled = runtime.events(httpVisit!.id).find((event) => event.type === 'called');
  const hostCalled = runtime.events(hostVisit!.id).find((event) => event.type === 'called');

  assert.equal(httpCalled?.actorId, undefined);
  assert.equal(hostCalled?.actorId, 'staff-session-1');
});

test('transition contract: parseTransitionBody actingLocationId erreicht den Service', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Scope',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created!.id, 'call');
  runtime.transition(created!.id, 'arrive');

  const httpContext = parseTransitionBody({ actingLocationId: 'reception' });
  assert.doesNotThrow(() => runtime.transition(created!.id, 'done', httpContext));
});
