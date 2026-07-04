import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import { assertJourneyTemplateEditable } from '@praxis-flow/flow-core';

test('assertJourneyTemplateEditable: blockiert bei offenen Visits', () => {
  assert.throws(
    () => assertJourneyTemplateEditable({ openVisitCount: 1 }),
    /JOURNEY_TEMPLATE_LOCKED/
  );
  assert.doesNotThrow(() => assertJourneyTemplateEditable({ openVisitCount: 0 }));
});

test('saveJourneyTemplate: bei offenen Visits nicht speicherbar', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  runtime.checkIn({ topicId: 'general', displayName: 'Offen', surfaceId: 'terminal_1' });
  const steps = catalog.journeySteps.filter((step) => step.templateId === 'journey_general');

  assert.throws(
    () => runtime.saveJourneyTemplate('journey_general', {
      name: 'Neuer Name',
      topicId: 'general',
      active: true,
      steps: steps.map((step) => ({
        sortOrder: step.sortOrder,
        targetLocationId: step.targetLocationId,
        queueId: step.queueId,
        movementMode: step.movementMode,
        publicDisplayMode: step.publicDisplayMode,
        advanceOn: step.advanceOn,
        instructionText: step.instructionText
      }))
    }),
    /JOURNEY_TEMPLATE_LOCKED/
  );
});

test('saveJourneyTemplate: ohne offene Visits erlaubt', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));

  const result = runtime.saveJourneyTemplate('journey_general', {
    name: 'Geaendert',
    topicId: 'general',
    active: true,
    steps: [
      { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', advanceOn: 'arrive' },
      { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'pickup', publicDisplayMode: 'hidden', advanceOn: 'start' }
    ]
  });

  assert.equal(result.template.name, 'Geaendert');
});
