import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';

function testRuntime() {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db) };
}

test('supersede: mfaAssist → general, neue Nummer, Link, checkedInAt erhalten', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  assert.equal(source.primaryTopicId, 'mfa');
  assert.ok(source.checkedInAt);

  const result = runtime.supersede(source.id, { topicId: 'general', preserveArrivedAt: true });

  assert.equal(result.superseded.status, 'cancelled');
  assert.equal(result.superseded.supersededByVisitId, result.visit.id);
  assert.equal(result.visit.supersedesVisitId, source.id);
  assert.equal(result.visit.primaryTopicId, 'general');
  assert.equal(result.visit.patientId, source.patientId);
  assert.equal(result.visit.checkedInAt, source.checkedInAt);
  assert.ok(result.visit.createdAt >= (source.checkedInAt ?? source.createdAt));
  assert.notEqual(result.visit.id, source.id);
  assert.notEqual(result.visit.queueNumber, source.queueNumber);
  assert.equal(result.visit.checkInPath, 'topic');
  assert.equal(result.visit.needsAssistance, true);
  assert.equal(result.visit.effectiveEscortPolicy, 'required');
  assert.equal(result.visit.movementMode, 'call');

  const active = runtime.visits();
  assert.equal(
    active.some((visit) => visit.id === source.id),
    false,
  );
  assert.equal(
    active.some((visit) => visit.id === result.visit.id),
    true,
  );

  const events = runtime.events(result.visit.id);
  const supersededEvent = events.find((event) => event.type === 'superseded');
  assert.equal(supersededEvent?.actorType, 'system');
});

test('supersede: Host-Actor mfa wird durchgereicht', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  const result = runtime.supersede(source.id, {
    topicId: 'general',
    actorType: 'mfa',
    actorId: 'staff-session-1',
  });
  const events = runtime.events(result.visit.id);
  assert.equal(events.find((event) => event.type === 'checked_in')?.actorType, 'mfa');
  assert.equal(events.find((event) => event.type === 'checked_in')?.actorId, 'staff-session-1');
  assert.equal(events.find((event) => event.type === 'routed')?.actorType, 'system');
});

test('supersede: Wartezeit-Anker bleibt vor späterem Check-in', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  const result = runtime.supersede(source.id, { topicId: 'general', preserveArrivedAt: true });
  const later = runtime.checkIn({ topicId: 'infection', surfaceId: 'terminal_1' });
  assert.ok(result.visit.checkedInAt);
  assert.ok(later.checkedInAt);
  assert.ok(result.visit.checkedInAt! <= later.checkedInAt!);
  assert.ok(result.visit.createdAt <= later.createdAt);
});

test('supersede: gleiches Topic abgelehnt', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });
  assert.throws(() => runtime.supersede(source.id, { topicId: 'general' }), /SUPERSEDE_SAME_TOPIC/);
});

test('supersede: terminales Ticket abgelehnt', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  runtime.transition(source.id, 'arrive');
  runtime.transition(source.id, 'start');
  runtime.transition(source.id, 'done');
  assert.throws(
    () => runtime.supersede(source.id, { topicId: 'general' }),
    /SUPERSEDE_SOURCE_TERMINAL/,
  );
});

test('supersede: doppeltes Supersede abgelehnt', () => {
  const { runtime } = testRuntime();
  const source = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  runtime.supersede(source.id, { topicId: 'general' });
  assert.throws(
    () => runtime.supersede(source.id, { topicId: 'infection' }),
    /SUPERSEDE_ALREADY_SUPERSEDED|SUPERSEDE_SOURCE_TERMINAL/,
  );
});

test('checkIn nach Supersede weiterhin ok', () => {
  const { runtime } = testRuntime();

  const before = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });
  assert.equal(before.queueNumber, 'A-001');

  const mfa = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  runtime.supersede(mfa.id, { topicId: 'infection' });

  const after = runtime.checkIn({ topicId: 'general', surfaceId: 'terminal_1' });
  assert.equal(after.queueNumber, 'A-002');
});
