import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJourneyRoutePreview,
  formatJourneyNextStepNote,
  lastKnownFromJourneyStep,
  ruleUsesJourneyRouting,
  visitOperationalLabel,
} from '@praxis-flow/flow-core';

test('ruleUsesJourneyRouting', () => {
  assert.equal(ruleUsesJourneyRouting({ journeyTemplateId: 'j1' }), true);
  assert.equal(ruleUsesJourneyRouting({ journeyTemplateId: null }), false);
});

test('lastKnownFromJourneyStep: Queue-Home als Wartebereich', () => {
  const step = { queueId: 'general_queue' };
  const queues = [{ id: 'general_queue', homeLocationId: 'waiting_general' }];
  assert.equal(lastKnownFromJourneyStep(step, queues), 'waiting_general');
});

test('formatJourneyNextStepNote', () => {
  assert.equal(
    formatJourneyNextStepNote({
      previousIndex: 0,
      nextIndex: 1,
      stepCount: 2,
      fromLocationName: 'Empfang',
      toLocationName: 'Raum 1',
    }),
    'Journey next step 1/2 → 2/2: Empfang → Raum 1',
  );
  assert.equal(
    formatJourneyNextStepNote({ previousIndex: 1, nextIndex: null, stepCount: 2 }),
    'Journey complete',
  );
});

test('visitOperationalLabel: waiting in Journey-Kontext', () => {
  const label = visitOperationalLabel({
    status: 'waiting',
    movementMode: 'call',
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 1,
    journeyStepLabel: '2/2',
    lastKnownLocation: { name: 'Empfang' },
    targetLocation: { name: 'Raum 1' },
  });
  assert.match(label, /Schritt 2\/2/);
  assert.match(label, /Empfang/);
  assert.match(label, /Raum 1/);
  assert.doesNotMatch(label, /Wartezimmer/);
});

test('buildJourneyRoutePreview', () => {
  const preview = buildJourneyRoutePreview(
    [{ targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call' }],
    [{ id: 'reception', name: 'Empfang' }],
    [{ id: 'general_queue', name: 'Allgemeine Warteliste' }],
  );
  assert.match(preview, /Schritt 1: Empfang/);
});
