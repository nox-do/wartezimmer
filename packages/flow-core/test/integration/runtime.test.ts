import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';

function testRuntime() {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db) };
}

test('checkIn needsAssistance: Topic und Route unveraendert, nur Flag gesetzt', () => {
  const { runtime } = testRuntime();
  const baseline = runtime.checkIn({
    topicId: 'general',
    displayName: 'Baseline',
    surfaceId: 'terminal_1',
  });
  const visit = runtime.checkIn({
    topicId: 'general',
    displayName: 'Test Patient',
    needsAssistance: true,
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.primaryTopicId, 'general');
  assert.equal(visit.needsAssistance, true);
  assert.equal(visit.checkInPath, 'topic');
  assert.equal(visit.movementMode, baseline.movementMode);
  assert.equal(visit.queueId, baseline.queueId);
  assert.equal(visit.effectiveEscortPolicy, baseline.effectiveEscortPolicy);
  assert.equal(visit.journeyTemplateId, baseline.journeyTemplateId);
});

test('checkIn mfaAssist: checkInPath mfa_assist, normale Warteschlange, kein needsAssistance', () => {
  const { runtime } = testRuntime();
  const visit = runtime.checkIn({
    mfaAssist: true,
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.primaryTopicId, 'mfa');
  assert.equal(visit.checkInPath, 'mfa_assist');
  assert.equal(visit.needsAssistance, false);
  assert.equal(visit.movementMode, 'call');
  assert.equal(visit.queueId, 'general_queue');
  assert.equal(visit.publicDisplayMode, 'visible');
  assert.equal(visit.allowRedirect, false);
  assert.equal(visit.effectiveEscortPolicy, 'none');
});

test('mfaAssist: redirect blockiert bei allowRedirect false', () => {
  const { runtime } = testRuntime();
  const visit = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });

  assert.throws(
    () =>
      runtime.redirect(visit.id, {
        queueId: 'lab_queue',
        targetLocationId: 'lab',
        movementMode: 'call',
        publicDisplayMode: 'visible',
      }),
    /REDIRECT_NOT_ALLOWED/,
  );
});

test('checkIn infection + needsAssistance: Route und Lane unveraendert', () => {
  const { runtime } = testRuntime();
  const baseline = runtime.checkIn({ topicId: 'infection', surfaceId: 'terminal_1' });
  const visit = runtime.checkIn({
    topicId: 'infection',
    needsAssistance: true,
    surfaceId: 'terminal_1',
  });

  assert.equal(baseline.queueNumber, 'I-001');
  assert.equal(visit.queueNumber, 'I-002');
  assert.equal(visit.queueLaneCode, 'I');
  assert.equal(visit.needsAssistance, true);
  assert.equal(visit.movementMode, baseline.movementMode);
  assert.equal(visit.queueId, baseline.queueId);
  assert.equal(visit.effectiveEscortPolicy, baseline.effectiveEscortPolicy);
});

test('checkIn Journey + needsAssistance: Autopilot bleibt aktiv', () => {
  const { runtime } = testRuntime();
  const visit = runtime.checkIn({
    topicId: 'general',
    needsAssistance: true,
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.needsAssistance, true);
  assert.equal(visit.journeyTemplateId, 'journey_general');
  assert.equal(visit.journeyStepIndex, 0);
});

test('checkIn Journey: Schritt 0 und Cursor gesetzt', () => {
  const { runtime } = testRuntime();
  const visit = runtime.checkIn({
    topicId: 'general',
    displayName: 'Journey Patient',
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.journeyTemplateId, 'journey_general');
  assert.equal(visit.journeyStepIndex, 0);
  assert.equal(visit.journeyState, 'active');
  assert.equal(visit.targetLocationId, 'reception');
  assert.equal(visit.movementMode, 'call');
  assert.equal(visit.lastKnownLocationId, 'waiting_general');
  assert.equal(visit.locationConfidence, 'assumed');
});

test('Journey completion: arrive am Empfang markiert Schritt 1/3 als erledigt', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Adv',
    surfaceId: 'terminal_1',
  });
  assert.equal(created.lastKnownLocationId, 'waiting_general');
  assert.equal(created.journeyStepLabel, '1/3');
  runtime.transition(created.id, 'call');
  const after = runtime.transition(created.id, 'arrive');

  assert.equal(after.journeyStepIndex, 0);
  assert.equal(after.journeyStepLabel, '1/3');
  assert.equal(after.lastKnownLocationId, 'reception');
  assert.equal(after.targetLocationId, 'reception');
  assert.equal(after.status, 'arrived');
  assert.ok(after.journeyStepCompletedAt);
  assert.ok(after.arrivedAt);
  const visitEvents = runtime.events(created.id);
  assert.ok(visitEvents.some((event) => event.type === 'journey_step_completed'));

  const next = runtime.transition(created.id, 'start_next_journey_step');
  assert.equal(next.journeyStepIndex, 1);
  assert.equal(next.journeyStepLabel, '2/3');
  assert.equal(next.targetLocationId, 'room_1');
  assert.equal(next.status, 'waiting');
  assert.equal(next.journeyStepCompletedAt, undefined);
  assert.equal(next.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
});

test('Journey next step: letzter Schritt setzt journeyStepIndex auf null', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Done',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive'); // 1/3 erledigt
  runtime.transition(created.id, 'start_next_journey_step'); // 1/3 → 2/3 Empfang
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive'); // 2/3 erledigt
  const atRoom = runtime.transition(created.id, 'start_next_journey_step'); // 2/3 → 3/3 Raum, ohne erneuten call-Zyklus (H7)

  assert.equal(atRoom.journeyStepIndex, 2);
  assert.equal(atRoom.status, 'arrived');
  assert.equal(atRoom.lastKnownLocationId, 'room_1');

  const after = runtime.transition(created.id, 'start');
  assert.equal(after.journeyStepIndex, undefined);
  assert.equal(after.journeyState, 'completed');
  assert.equal(after.status, 'in_progress');
  assert.equal(after.lastKnownLocationId, 'room_1');
  const visitEvents = runtime.events(created.id);
  assert.ok(visitEvents.some((event) => event.type === 'journey_completed'));
});

test('Journey next step mit Escort: self_go → pickup + Escort-Terminaltext', () => {
  const { db, runtime } = testRuntime();
  const catalog = runtime.catalog();
  const steps = catalog.journeySteps.filter((step) => step.templateId === 'journey_general');

  db.prepare('UPDATE routing_rules SET escort_policy = ? WHERE id = ?').run(
    'required',
    'rule_general',
  );
  runtime.saveJourneyTemplate('journey_general', {
    name: 'Sprechstunde Standard',
    topicId: 'general',
    active: true,
    steps: [
      {
        id: steps[0].id,
        sortOrder: 0,
        targetLocationId: 'reception',
        queueId: 'general_queue',
        movementMode: 'call',
        publicDisplayMode: 'visible',
        completedWhen: 'arrive',
      },
      {
        id: steps[1].id,
        sortOrder: 1,
        targetLocationId: 'room_1',
        queueId: null,
        movementMode: 'self_go',
        publicDisplayMode: 'hidden',
        completedWhen: 'start',
      },
    ],
  });

  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Escort',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive');
  const after = runtime.transition(created.id, 'start_next_journey_step');

  assert.equal(after.movementMode, 'pickup');
  assert.match(after.terminalInstruction, /begleitet/);
  assert.doesNotMatch(after.terminalInstruction, /gehen Sie direkt/i);
});

test('redirect: journeyStepIndex null, journeyTemplateId bleibt, Journey-Exit-Event', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Redir',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  const after = runtime.redirect(created.id, {
    queueId: 'lab_queue',
    targetLocationId: 'lab',
    movementMode: 'call',
    publicDisplayMode: 'visible',
  });

  assert.equal(after.journeyTemplateId, 'journey_general');
  assert.equal(after.journeyStepIndex, undefined);
  assert.equal(after.journeyState, 'abandoned');
  assert.equal(after.targetLocationId, 'lab');
  assert.equal(after.calledAt, undefined);
  assert.equal(after.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
  const visitEvents = runtime.events(created.id);
  assert.ok(visitEvents.some((event) => event.type === 'journey_abandoned'));
  const abandoned = visitEvents.find((event) => event.type === 'journey_abandoned');
  const redirected = visitEvents.find((event) => event.type === 'redirected');
  assert.equal(abandoned?.note, 'wegen Redirect');
  assert.ok(abandoned?.correlationId);
  assert.equal(abandoned?.correlationId, redirected?.correlationId);
});

test('redirect: locationSemantics confirmed setzt lastKnownLocationId', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Conf',
    surfaceId: 'terminal_1',
  });
  const after = runtime.redirect(created.id, {
    queueId: 'lab_queue',
    targetLocationId: 'lab',
    movementMode: 'call',
    publicDisplayMode: 'visible',
    locationSemantics: 'confirmed',
  });

  assert.equal(after.lastKnownLocationId, 'lab');
  assert.equal(after.locationConfidence, 'confirmed');
});

test('redirect: preserveTerminalInstruction behaelt alten Hinweis', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Keep',
    surfaceId: 'terminal_1',
  });
  const beforeInstruction = created.terminalInstruction;
  const after = runtime.redirect(created.id, {
    queueId: 'lab_queue',
    targetLocationId: 'lab',
    movementMode: 'call',
    publicDisplayMode: 'visible',
    preserveTerminalInstruction: true,
  });

  assert.equal(after.terminalInstruction, beforeInstruction);
});

test('Infekt-pickup: start aus waiting wird blockiert', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'infection',
    displayName: 'Infekt',
    surfaceId: 'terminal_1',
  });

  assert.throws(() => runtime.transition(created.id, 'start'), /START_ONLY_WHEN_ARRIVED/);
});

test('needsAssistance: start aus waiting wird blockiert wie normaler Patient', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Assist',
    needsAssistance: true,
    surfaceId: 'terminal_1',
  });

  assert.throws(() => runtime.transition(created.id, 'start'), /START_ONLY_WHEN_ARRIVED/);
});

test('redirect: self_go blockiert bei effectiveEscortPolicy required', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'infection',
    displayName: 'Infekt',
    surfaceId: 'terminal_1',
  });

  assert.throws(
    () =>
      runtime.redirect(created.id, {
        queueId: 'infection_queue',
        targetLocationId: 'waiting_infection',
        movementMode: 'self_go',
        publicDisplayMode: 'hidden',
      }),
    /SELF_GO_BLOCKED_BY_ESCORT_POLICY/,
  );
});

test('updateVisit patchField: nullable Felder können auf null gesetzt werden', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Null',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  const after = runtime.redirect(created.id, {
    queueId: null,
    targetLocationId: 'room_1',
    movementMode: 'pickup',
    publicDisplayMode: 'hidden',
  });

  assert.equal(after.queueId, undefined);
  assert.equal(after.calledAt, undefined);
  assert.equal(after.arrivedAt, undefined);
});

test('checkIn: disjunkte Terminal-Scopes waehlen passende Rule', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db);
  db.prepare(
    `INSERT INTO routing_rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'rule_blood_t1',
    'blood',
    'A Blut Eingang',
    'entrance',
    'lab',
    'lab_queue',
    'call',
    'instructed',
    'visible',
    'Bitte warten am Eingang.',
    0,
    'none',
    1,
    '["terminal_1"]',
    null,
    1,
  );

  const atT2 = runtime.checkIn({ topicId: 'blood', displayName: 'Labor', surfaceId: 'terminal_2' });
  assert.equal(atT2.appliedRoutingRuleId, 'rule_blood');

  const atT1 = runtime.checkIn({
    topicId: 'blood',
    displayName: 'Eingang',
    surfaceId: 'terminal_1',
  });
  assert.equal(atT1.appliedRoutingRuleId, 'rule_blood_t1');
});

test('createRuntime uses injected resolveBusinessDay for ticket snapshot', () => {
  const db = openDb({ path: ':memory:' });
  const runtime = createRuntime(db, { resolveBusinessDay: () => '2026-06-02' });
  const visit = runtime.checkIn({
    topicId: 'general',
    displayName: 'Fixed Day',
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.queueNumberDate, '2026-06-02');
});

test('checkIn: Visit-ID entspricht Ticket-Format', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }), {
    resolveBusinessDay: () => '2026-06-02',
  });
  const visit = runtime.checkIn({
    topicId: 'general',
    displayName: 'Ticket-ID',
    surfaceId: 'terminal_1',
    authPath: 'name_dob',
  });

  assert.equal(visit.id, '20260602-A-001');
  assert.equal(visit.queueNumber, 'A-001');
  assert.equal(visit.authPath, 'name_dob');
  assert.equal(visit.checkInPath, 'topic');
});

test('transition call: targetLocationId setzt Aufrufziel', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Call Room',
    surfaceId: 'terminal_1',
  });
  const called = runtime.transition(created.id, 'call', { targetLocationId: 'room_1' });

  assert.equal(called.status, 'called');
  assert.equal(called.targetLocationId, 'room_1');
});

test('transition: actingLocationId blockiert falschen Raum', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Scope',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'room_1' });

  assert.throws(
    () => runtime.transition(created.id, 'arrive', { actingLocationId: 'room_2' }),
    /VISIT_LOCATION_MISMATCH/,
  );

  const arrived = runtime.transition(created.id, 'arrive', { actingLocationId: 'room_1' });
  assert.equal(arrived.status, 'arrived');
  assert.equal(arrived.lastKnownLocationId, 'room_1');
});

test('transition done: Raum-Panel darf direkt nach arrive abschliessen', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Panel',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'room_1' });
  runtime.transition(created.id, 'arrive', { actingLocationId: 'room_1' });

  const done = runtime.transition(created.id, 'done', { actingLocationId: 'room_1' });
  assert.equal(done.status, 'done');
  assert.ok(done.startedAt);
});

test('transition return_to_waiting: called → waiting, Aufrufziel bleibt, Timestamps gelöscht', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'blood',
    displayName: 'Recall',
    surfaceId: 'terminal_2',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'lab' });

  const after = runtime.transition(created.id, 'return_to_waiting');

  assert.equal(after.status, 'waiting');
  assert.equal(after.targetLocationId, 'lab');
  assert.equal(after.calledAt, undefined);
  assert.equal(after.arrivedAt, undefined);
  assert.equal(after.startedAt, undefined);
  assert.equal(after.lastKnownLocationId, 'lab');
  const events = runtime.events(created.id);
  assert.ok(events.some((event) => event.type === 'returned_to_waiting'));
});

test('transition return_to_waiting: arrive → waiting', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'blood',
    displayName: 'Recall2',
    surfaceId: 'terminal_2',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'lab' });
  runtime.transition(created.id, 'arrive', { actingLocationId: 'lab' });

  const after = runtime.transition(created.id, 'return_to_waiting');

  assert.equal(after.status, 'waiting');
  assert.equal(after.targetLocationId, 'lab');
  assert.equal(after.lastKnownLocationId, 'lab');
  assert.equal(after.queueId, 'lab_queue');
});

test('transition return_to_waiting: in_progress → waiting', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'blood',
    displayName: 'Recall3',
    surfaceId: 'terminal_2',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'lab' });
  runtime.transition(created.id, 'arrive', { actingLocationId: 'lab' });
  runtime.transition(created.id, 'start', { actingLocationId: 'lab' });

  const after = runtime.transition(created.id, 'return_to_waiting');

  assert.equal(after.status, 'waiting');
  assert.equal(after.targetLocationId, 'lab');
  assert.equal(after.startedAt, undefined);
  assert.equal(after.lastKnownLocationId, 'lab');
});

test('transition return_to_waiting: Journey rehydriert Aufrufziel aus aktivem Step', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Journey',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'room_1' });

  const after = runtime.transition(created.id, 'return_to_waiting');

  assert.equal(after.journeyTemplateId, 'journey_general');
  assert.equal(after.journeyStepIndex, 0);
  assert.equal(after.journeyState, 'active');
  assert.equal(after.targetLocationId, 'reception');
  assert.ok(!runtime.events(created.id).some((event) => event.type === 'journey_abandoned'));
});

test('transition return_to_waiting: done blockiert', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Done',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call', { targetLocationId: 'room_1' });
  runtime.transition(created.id, 'arrive', { actingLocationId: 'room_1' });
  runtime.transition(created.id, 'done', { actingLocationId: 'room_1' });

  assert.throws(
    () => runtime.transition(created.id, 'return_to_waiting'),
    /RETURN_TO_WAITING_NOT_ALLOWED/,
  );
});
