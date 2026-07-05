import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import {
  parseCheckInBody,
  parseRedirectBody,
  parseSaveJourneyTemplateBody,
  parseSaveRuleBody,
  parseTransitionAction
} from '@praxis-flow/flow-core';

test('parseCheckInBody: topicId oder mfaAssist erforderlich', () => {
  assert.throws(() => parseCheckInBody({}), /CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED/);
  const body = parseCheckInBody({ topicId: 'general', surfaceId: 'terminal_1' });
  assert.equal(body.topicId, 'general');
  assert.equal(body.surfaceId, 'terminal_1');
  assert.equal(parseCheckInBody({ mfaAssist: true }).mfaAssist, true);
});

test('parseTransitionAction: unbekannte Action', () => {
  assert.throws(() => parseTransitionAction('pause'), /UNKNOWN_ACTION/);
  assert.equal(parseTransitionAction('call'), 'call');
});

test('parseRedirectBody: Enum-Validierung', () => {
  assert.throws(
    () => parseRedirectBody({ movementMode: 'fly', publicDisplayMode: 'visible' }),
    /INVALID_MOVEMENT_MODE/
  );
});

test('parseRedirectBody: ungültige queueId-Typen werden abgelehnt', () => {
  assert.throws(
    () => parseRedirectBody({ queueId: {}, movementMode: 'call', publicDisplayMode: 'visible' }),
    /INVALID_REQUEST_BODY/
  );
});

test('parseSaveRuleBody und parseSaveJourneyTemplateBody', () => {
  const rule = parseSaveRuleBody({
    topicId: 'general',
    initialMovementMode: 'call',
    initialLocationConfidence: 'assumed',
    publicDisplayMode: 'visible',
    escortPolicy: 'none',
    active: true
  });
  assert.equal(rule.topicId, 'general');

  const template = parseSaveJourneyTemplateBody({
    name: 'Test',
    active: true,
    steps: [
      { id: 'step_1', sortOrder: 0, movementMode: 'call', publicDisplayMode: 'visible', advanceOn: 'arrive' }
    ]
  });
  assert.equal(template.steps.length, 1);
  assert.equal(template.steps[0].id, 'step_1');
});

test('saveRule: unbekannte Rule liefert ROUTING_RULE_NOT_FOUND', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const general = catalog.routingRules.find((item) => item.id === 'rule_general');

  assert.throws(
    () => runtime.saveRule('missing_rule', {
      topicId: general.topicId,
      initialMovementMode: general.initialMovementMode,
      initialLocationConfidence: general.initialLocationConfidence,
      publicDisplayMode: general.publicDisplayMode,
      terminalInstructionTemplate: general.terminalInstructionTemplate,
      escortPolicy: general.escortPolicy,
      active: true
    }),
    /ROUTING_RULE_NOT_FOUND/
  );
});

test('saveRule: falsches topicId wird abgelehnt (Journey-Spoofing)', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const infection = catalog.routingRules.find((item) => item.id === 'rule_infection');

  assert.throws(
    () => runtime.saveRule('rule_infection', {
      topicId: 'general',
      initialMovementMode: infection.initialMovementMode,
      initialLocationConfidence: infection.initialLocationConfidence,
      publicDisplayMode: infection.publicDisplayMode,
      terminalInstructionTemplate: infection.terminalInstructionTemplate,
      escortPolicy: infection.escortPolicy,
      journeyTemplateId: 'journey_general',
      active: true
    }),
    /ROUTING_RULE_TOPIC_IMMUTABLE/
  );
});
test('saveJourneyTemplate: leere aktive Journey wird verhindert', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));

  assert.throws(
    () => runtime.saveJourneyTemplate('journey_general', { name: 'Leer', topicId: 'general', active: true, steps: [] }),
    /JOURNEY_STEPS_EMPTY/
  );
});

test('redirect: Surface ohne supportsRedirect wird abgelehnt', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const created = runtime.checkIn({ topicId: 'general', displayName: 'Redirect', surfaceId: 'terminal_1' });

  assert.throws(
    () => runtime.redirect(created.id, {
      queueId: 'lab_queue',
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      actorSurfaceId: 'waiting_tv'
    }),
    /REDIRECT_SURFACE_NOT_ALLOWED/
  );
});

test('redirect: inaktive Location wird abgelehnt', () => {
  const { db, runtime } = (() => {
    const db = openDb({ path: ':memory:' });
    return { db, runtime: createRuntime(db) };
  })();
  db.prepare('UPDATE locations SET active = 0 WHERE id = ?').run('lab');
  const created = runtime.checkIn({ topicId: 'general', displayName: 'Loc', surfaceId: 'terminal_1' });

  assert.throws(
    () => runtime.redirect(created.id, {
      queueId: 'lab_queue',
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible'
    }),
    /LOCATION_INACTIVE_OR_MISSING/
  );
});
