import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@wartezimmer/flow-core/server';
import { assertJourneyTemplateEditable } from '@wartezimmer/flow-core';

test('assertJourneyTemplateEditable: blockiert bei offenen Visits', () => {
  assert.throws(
    () => assertJourneyTemplateEditable({ openVisitCount: 1 }),
    /JOURNEY_TEMPLATE_LOCKED/,
  );
  assert.doesNotThrow(() => assertJourneyTemplateEditable({ openVisitCount: 0 }));
});

test('saveJourneyTemplate: bei offenen Visits nicht speicherbar', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  runtime.checkIn({ topicId: 'general', displayName: 'Offen', surfaceId: 'terminal_1' });
  const steps = catalog.journeySteps.filter((step) => step.templateId === 'journey_general');

  assert.throws(
    () =>
      runtime.saveJourneyTemplate('journey_general', {
        name: 'Neuer Name',
        topicId: 'general',
        active: true,
        steps: steps.map((step) => ({
          id: step.id,
          sortOrder: step.sortOrder,
          targetLocationId: step.targetLocationId,
          queueId: step.queueId,
          movementMode: step.movementMode,
          publicDisplayMode: step.publicDisplayMode,
          completedWhen: step.completedWhen,
          instructionText: step.instructionText,
        })),
      }),
    /JOURNEY_TEMPLATE_LOCKED/,
  );
});

test('saveJourneyTemplate: abandoned open Visit sperrt Template nicht', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const created = runtime.checkIn({
    topicId: 'general',
    displayName: 'Abandoned',
    surfaceId: 'terminal_1',
  });
  runtime.redirect(created.id, {
    targetLocationId: 'room_1',
    movementMode: 'call',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'mfa_dashboard',
  });
  assert.equal(
    runtime.visits().find((visit) => visit.id === created.id)?.journeyState,
    'abandoned',
  );

  const steps = catalog.journeySteps.filter((step) => step.templateId === 'journey_general');
  assert.doesNotThrow(() =>
    runtime.saveJourneyTemplate('journey_general', {
      name: 'Nach Redirect editierbar',
      topicId: 'general',
      active: true,
      steps: steps.map((step) => ({
        id: step.id,
        sortOrder: step.sortOrder,
        targetLocationId: step.targetLocationId,
        queueId: step.queueId,
        movementMode: step.movementMode,
        publicDisplayMode: step.publicDisplayMode,
        completedWhen: step.completedWhen,
        instructionText: step.instructionText,
      })),
    }),
  );
});

test('saveJourneyTemplate: ohne offene Visits erlaubt', () => {
  const runtime = createRuntime(openDb({ path: ':memory:' }));
  const catalog = runtime.catalog();
  const steps = catalog.journeySteps.filter((step) => step.templateId === 'journey_general');

  const result = runtime.saveJourneyTemplate('journey_general', {
    name: 'Geaendert',
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
        movementMode: 'pickup',
        publicDisplayMode: 'hidden',
        completedWhen: 'start',
      },
    ],
  });

  assert.equal(result.template.name, 'Geaendert');
});
