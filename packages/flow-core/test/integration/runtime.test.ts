import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import { parseRedirectBody } from '@praxis-flow/flow-core';

function testRuntime() {
  const db = openDb({ path: ':memory:' });
  return { db, runtime: createRuntime(db) };
}

test('checkIn: ungueltige Kombinationen werden an der Runtime abgelehnt', () => {
  const { runtime } = testRuntime();

  assert.throws(
    () => runtime.checkIn({ surfaceId: 'terminal_1' }),
    /CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED/,
  );
  assert.throws(
    () => runtime.checkIn({ needsAssistance: true, surfaceId: 'terminal_1' }),
    /CHECKIN_ASSISTANCE_REQUIRES_TOPIC/,
  );
  assert.throws(
    () => runtime.checkIn({ mfaAssist: true, topicId: 'general', surfaceId: 'terminal_1' }),
    /CHECKIN_MFA_ASSIST_EXCLUSIVE/,
  );
  assert.doesNotThrow(() =>
    runtime.checkIn({ mfaAssist: true, needsAssistance: true, surfaceId: 'terminal_1' }),
  );
});

test('checkIn needsAssistance: Topic bleibt erhalten und Escort wird erforderlich', () => {
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
  assert.equal(visit.effectiveEscortPolicy, 'required');
  assert.equal(visit.journeyTemplateId, baseline.journeyTemplateId);
});

test('checkIn mfaAssist: M-Ticket wartet auf Abholung und traegt Assistance-Flag', () => {
  const { runtime } = testRuntime();
  const direct = runtime.checkIn({
    topicId: 'mfa',
    authPath: 'none',
    surfaceId: 'terminal_1',
  });
  const visit = runtime.checkIn({
    mfaAssist: true,
    surfaceId: 'terminal_1',
  });

  assert.equal(direct.checkInPath, 'topic');
  assert.equal(direct.needsAssistance, false);
  assert.equal(direct.movementMode, 'self_go');
  assert.equal(visit.primaryTopicId, 'mfa');
  assert.equal(visit.checkInPath, 'mfa_assist');
  assert.equal(visit.needsAssistance, true);
  assert.equal(visit.movementMode, 'pickup');
  assert.equal(visit.queueId, 'general_queue');
  assert.equal(visit.publicDisplayMode, 'visible');
  assert.equal(visit.allowRedirect, false);
  assert.equal(visit.effectiveEscortPolicy, 'required');
});

test('pickup in einen Wartebereich bleibt nach Ankunft in der Warteliste', () => {
  const { runtime } = testRuntime();
  const visit = runtime.checkIn({
    topicId: 'general',
    needsAssistance: true,
    surfaceId: 'terminal_1',
  });
  runtime.redirect(visit.id, {
    queueId: 'general_queue',
    targetLocationId: 'waiting_general',
    movementMode: 'pickup',
    publicDisplayMode: 'visible',
  });

  const arrived = runtime.transition(visit.id, 'arrive');

  assert.equal(arrived.status, 'waiting');
  assert.equal(arrived.lastKnownLocationId, 'waiting_general');
  assert.equal(arrived.movementMode, 'call');
  assert.equal(arrived.arrivedAt, undefined);
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

test('checkIn infection + needsAssistance: Lane bleibt, Escort wird erforderlich', () => {
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
  assert.equal(visit.movementMode, 'pickup');
  assert.equal(visit.queueId, baseline.queueId);
  assert.equal(visit.effectiveEscortPolicy, 'required');
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

test('checkIn Journey: Step-0 instructionText wird übernommen', () => {
  const { db, runtime } = testRuntime();
  db.prepare('UPDATE journey_steps SET instruction_text = ? WHERE id = ?').run(
    'Bitte melden Sie sich am Empfang.',
    'step_general_0',
  );

  const visit = runtime.checkIn({
    topicId: 'general',
    displayName: 'Instruction',
    surfaceId: 'terminal_1',
  });

  assert.equal(visit.terminalInstruction, 'Bitte melden Sie sich am Empfang.');
});

test('Events haben stabile Reihenfolge, Actor-ID und historische Ortsnamen', () => {
  const { db, runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Audit',
    surfaceId: 'terminal_1',
  });
  const receptionName = (
    db.prepare('SELECT name FROM locations WHERE id = ?').get('reception') as { name: string }
  ).name;

  runtime.transition(created.id, 'call', { actorId: 'staff-session-1' });
  db.prepare('UPDATE locations SET name = ? WHERE id = ?').run('Neuer Empfang', 'reception');

  const events = runtime.events(created.id);
  assert.deepEqual(
    events.map((event) => event.sequence),
    events.map((_, index) => index + 1),
  );
  assert.equal(events.find((event) => event.type === 'checked_in')?.actorId, 'terminal_1');
  const called = events.find((event) => event.type === 'called');
  assert.equal(called?.actorId, 'staff-session-1');
  assert.equal(called?.toLocationName, receptionName);
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

test('Journey next step: optionales Ziel überschreibt nur den gestarteten Hop', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Reroute',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive');

  const next = runtime.transition(created.id, 'start_next_journey_step', {
    targetLocationId: 'room_2',
  });

  assert.equal(next.journeyStepIndex, 1);
  assert.equal(next.targetLocationId, 'room_2');
  assert.equal(next.status, 'waiting');
  assert.equal(next.journeyState, 'active');
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

test('redirect: fehlende queueId/targetLocationId behalten DB-Werte, Event und Terminaltext', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'KeepTarget',
    surfaceId: 'terminal_1',
  });

  assert.equal(created.targetLocationId, 'reception');
  assert.equal(created.queueId, 'general_queue');
  const preservedTarget = created.targetLocationId!;
  const preservedQueue = created.queueId!;

  const body = parseRedirectBody({
    movementMode: 'pickup',
    publicDisplayMode: 'hidden',
  });
  const after = runtime.redirect(created.id, body);

  assert.equal(after?.targetLocationId, preservedTarget);
  assert.equal(after?.queueId, preservedQueue);
  assert.match(after!.terminalInstruction, /begleitet/);
  assert.match(after!.terminalInstruction, /Empfang/);
  assert.doesNotMatch(after!.terminalInstruction, /gehen Sie direkt/i);

  const redirected = runtime.events(created.id).find((event) => event.type === 'redirected');
  assert.equal(redirected?.toLocationId, preservedTarget);
  assert.equal(redirected?.toQueueId, preservedQueue);
});

test('redirect: explizites null loescht queue/target in DB und Event', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'ClearTarget',
    surfaceId: 'terminal_1',
  });

  const body = parseRedirectBody({
    queueId: null,
    targetLocationId: null,
    movementMode: 'call',
    publicDisplayMode: 'visible',
  });
  const after = runtime.redirect(created.id, body);

  assert.equal(after?.queueId, undefined);
  assert.equal(after?.targetLocationId, undefined);

  const redirected = runtime.events(created.id).find((event) => event.type === 'redirected');
  assert.equal(redirected?.toLocationId, undefined);
  assert.equal(redirected?.toQueueId, undefined);
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
  assert.equal(done.journeyState, 'abandoned');
  assert.ok(runtime.events(created.id).some((event) => event.type === 'journey_abandoned'));
});

test('transition done mid-Journey: terminal done abandoned die Journey', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'MidDone',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive');
  runtime.transition(created.id, 'start');

  const done = runtime.transition(created.id, 'done');
  assert.equal(done.status, 'done');
  assert.equal(done.journeyState, 'abandoned');
  assert.equal(done.journeyStepIndex, 0);
  const abandoned = runtime.events(created.id).find((event) => event.type === 'journey_abandoned');
  assert.ok(abandoned);
  assert.match(abandoned?.note ?? '', /Entlassen/);
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

test('transition return_to_waiting: directed/self_go → waiting/call', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'mfa',
    displayName: 'Direct Return',
    surfaceId: 'terminal_1',
  });
  assert.equal(created.status, 'directed');
  assert.equal(created.movementMode, 'self_go');

  const after = runtime.transition(created.id, 'return_to_waiting');

  assert.equal(after.status, 'waiting');
  assert.equal(after.movementMode, 'call');
  assert.equal(after.targetLocationId, created.targetLocationId);
  assert.equal(after.lastKnownLocationId, 'waiting_general');
  assert.match(after.terminalInstruction, /aufgerufen/);
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

test('transition return_to_waiting: Journey behält operatives Aufrufziel', () => {
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
  assert.equal(after.targetLocationId, 'room_1');
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

test('cancel: beendet Visit und aktive Journey mit korrelierter Historie', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Cancel',
    surfaceId: 'terminal_1',
  });

  const cancelled = runtime.cancel(created.id, { note: 'durch MFA beendet' });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.journeyState, 'abandoned');
  assert.ok(cancelled.finishedAt);
  const events = runtime.events(created.id);
  const abandoned = events.find((event) => event.type === 'journey_abandoned');
  const cancelEvent = events.find((event) => event.type === 'cancelled');
  assert.ok(abandoned?.correlationId);
  assert.equal(abandoned?.correlationId, cancelEvent?.correlationId);
});

test('reassignTarget: ändert nur den operativen Hop und hält Journey aktiv', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Reassign',
    surfaceId: 'terminal_1',
  });
  runtime.transition(created.id, 'call');
  runtime.transition(created.id, 'arrive');
  const completedAt = runtime
    .visits()
    .find((visit) => visit.id === created.id)?.journeyStepCompletedAt;

  const reassigned = runtime.reassignTarget(created.id, { targetLocationId: 'room_2' });

  assert.equal(reassigned.status, 'called');
  assert.equal(reassigned.targetLocationId, 'room_2');
  assert.equal(reassigned.movementMode, 'call');
  assert.equal(reassigned.journeyState, 'active');
  assert.equal(reassigned.journeyStepIndex, 0);
  assert.ok(completedAt);
  assert.equal(reassigned.journeyStepCompletedAt, completedAt);
  assert.ok(runtime.events(created.id).some((event) => event.type === 'target_reassigned'));
  assert.ok(!runtime.events(created.id).some((event) => event.type === 'journey_abandoned'));

  const waiting = runtime.transition(created.id, 'return_to_waiting');
  assert.equal(waiting.targetLocationId, 'room_2');
});

test('reassignTarget: behält konfigurierte pickup-Bewegung bei', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({ topicId: 'infection', surfaceId: 'terminal_1' });
  runtime.transition(created.id, 'arrive');

  const reassigned = runtime.reassignTarget(created.id, { targetLocationId: 'room_2' });

  assert.equal(reassigned.movementMode, 'pickup');
  assert.equal(reassigned.status, 'waiting');
  assert.match(reassigned.terminalInstruction, /begleitet/);
});

test('reassignTarget: wartende Abholung kann vor Ankunft bewusst neu platziert werden', () => {
  const { runtime } = testRuntime();
  const created = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });

  const reassigned = runtime.reassignTarget(created.id, { targetLocationId: 'room_2' });
  assert.equal(reassigned.status, 'waiting');
  assert.equal(reassigned.movementMode, 'pickup');
  assert.equal(reassigned.targetLocationId, 'room_2');

  const arrived = runtime.transition(created.id, 'arrive');
  assert.equal(arrived.status, 'arrived');
  assert.equal(arrived.lastKnownLocationId, 'room_2');
});
