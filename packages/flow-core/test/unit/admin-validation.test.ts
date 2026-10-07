import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createRuntime } from '@wartezimmer/flow-core/server';
import {
  surfaceDisplayRulesOverlap,
  terminalScopesOverlap,
  validateCatalogIntegrity,
  validateJourneyTemplateDraft,
  validateRoutingRuleDraft,
  validateSurfaceDisplayRules,
} from '@wartezimmer/flow-core';

function baseCatalog() {
  const { runtime } = { runtime: createRuntime(openDb({ path: ':memory:' })) };
  return runtime.catalog();
}

test('validateRoutingRuleDraft: doppelte aktive Rules pro Topic werden verhindert', () => {
  const catalog = baseCatalog();
  const general = catalog.routingRules.find((item) => item.id === 'rule_general');

  assert.throws(
    () => validateRoutingRuleDraft(catalog, { ...general, active: true }, { ruleId: 'rule_new' }),
    /DUPLICATE_ACTIVE_ROUTING_RULE/,
  );
});

test('validateRoutingRuleDraft: unterschiedliche Terminal-Scopes erlauben zwei aktive Rules', () => {
  const catalog = baseCatalog();
  const general = catalog.routingRules.find((item) => item.id === 'rule_general');

  assert.doesNotThrow(() =>
    validateRoutingRuleDraft(
      catalog,
      {
        ...general,
        allowedSurfaceIds: ['terminal_2'],
        active: true,
      },
      { ruleId: 'rule_new' },
    ),
  );
});

test('validateRoutingRuleDraft: Journey-Topic-Mismatch wird verhindert', () => {
  const catalog = baseCatalog();
  const infection = catalog.routingRules.find((item) => item.id === 'rule_infection');

  assert.throws(
    () =>
      validateRoutingRuleDraft(
        catalog,
        {
          ...infection,
          journeyTemplateId: 'journey_general',
          active: true,
        },
        { ruleId: 'rule_infection' },
      ),
    /JOURNEY_TOPIC_MISMATCH/,
  );
});

test('validateJourneyTemplateDraft: leere aktive Journey wird verhindert', () => {
  const catalog = baseCatalog();

  assert.throws(
    () =>
      validateJourneyTemplateDraft(catalog, {
        name: 'Leer',
        topicId: 'general',
        active: true,
        steps: [],
      }),
    /JOURNEY_STEPS_EMPTY/,
  );
});

test('validateJourneyTemplateDraft: doppelte sortOrder wird verhindert', () => {
  const catalog = baseCatalog();

  assert.throws(
    () =>
      validateJourneyTemplateDraft(catalog, {
        name: 'Dup',
        topicId: 'general',
        active: true,
        steps: [
          {
            sortOrder: 0,
            targetLocationId: 'reception',
            queueId: 'general_queue',
            movementMode: 'call',
            publicDisplayMode: 'visible',
            completedWhen: 'arrive',
          },
          {
            sortOrder: 0,
            targetLocationId: 'room_1',
            queueId: null,
            movementMode: 'call',
            publicDisplayMode: 'hidden',
            completedWhen: 'start',
          },
        ],
      }),
    /DUPLICATE_JOURNEY_SORT_ORDER/,
  );
});

test('validateJourneyTemplateDraft: doppelte Step-IDs werden verhindert', () => {
  const catalog = baseCatalog();

  assert.throws(
    () =>
      validateJourneyTemplateDraft(catalog, {
        name: 'DupIds',
        topicId: 'general',
        active: true,
        steps: [
          {
            id: 'step_same',
            sortOrder: 0,
            targetLocationId: 'reception',
            queueId: 'general_queue',
            movementMode: 'call',
            publicDisplayMode: 'visible',
            completedWhen: 'arrive',
          },
          {
            id: 'step_same',
            sortOrder: 1,
            targetLocationId: 'room_1',
            queueId: null,
            movementMode: 'call',
            publicDisplayMode: 'hidden',
            completedWhen: 'start',
          },
        ],
      }),
    /DUPLICATE_JOURNEY_STEP_ID/,
  );
});

test('validateJourneyTemplateDraft: ungültige movementMode werden abgelehnt', () => {
  const catalog = baseCatalog();

  assert.throws(
    () =>
      validateJourneyTemplateDraft(catalog, {
        name: 'Bad',
        topicId: 'general',
        active: true,
        steps: [
          {
            sortOrder: 0,
            targetLocationId: 'reception',
            queueId: 'general_queue',
            movementMode: 'fly',
            publicDisplayMode: 'visible',
            completedWhen: 'arrive',
          },
        ],
      }),
    /INVALID_MOVEMENT_MODE/,
  );
});

test('validateSurfaceDisplayRules: mehrdeutige Regeln gleicher Prioritaet werden abgelehnt', () => {
  const catalog = baseCatalog();

  assert.throws(
    () =>
      validateSurfaceDisplayRules(catalog, [
        {
          id: 'a',
          surfaceId: 'waiting_tv',
          queueId: 'general_queue',
          locationId: null,
          topicId: null,
          displayMode: 'visible',
          sortOrder: 10,
        },
        {
          id: 'b',
          surfaceId: 'waiting_tv',
          queueId: 'general_queue',
          locationId: null,
          topicId: null,
          displayMode: 'hidden',
          sortOrder: 10,
        },
      ]),
    /SURFACE_DISPLAY_RULE_AMBIGUOUS/,
  );
});

test('validateSurfaceDisplayRules: Seed-Katalog ist konfliktfrei', () => {
  const catalog = baseCatalog();
  assert.doesNotThrow(() => validateSurfaceDisplayRules(catalog, catalog.surfaceDisplayRules));
});

test('terminalScopesOverlap und surfaceDisplayRulesOverlap', () => {
  assert.equal(terminalScopesOverlap(null, ['terminal_1']), true);
  assert.equal(terminalScopesOverlap(['terminal_1'], ['terminal_2']), false);
  assert.equal(
    surfaceDisplayRulesOverlap(
      {
        id: '1',
        surfaceId: 's',
        queueId: 'q1',
        locationId: null,
        topicId: null,
        displayMode: 'visible',
      },
      {
        id: '2',
        surfaceId: 's',
        queueId: 'q1',
        locationId: 'lab',
        topicId: null,
        displayMode: 'hidden',
      },
    ),
    true,
  );
  assert.equal(
    surfaceDisplayRulesOverlap(
      {
        id: '1',
        surfaceId: 's',
        queueId: null,
        locationId: 'lab',
        topicId: null,
        displayMode: 'visible',
        sortOrder: 0,
      },
      {
        id: '2',
        surfaceId: 's',
        queueId: null,
        locationId: 'reception',
        topicId: null,
        displayMode: 'hidden',
        sortOrder: 0,
      },
    ),
    false,
  );
  assert.equal(
    surfaceDisplayRulesOverlap(
      {
        id: '1',
        surfaceId: 's',
        queueId: 'general_queue',
        locationId: null,
        topicId: null,
        displayMode: 'visible',
      },
      {
        id: '2',
        surfaceId: 's',
        queueId: 'infection_queue',
        locationId: null,
        topicId: null,
        displayMode: 'hidden',
      },
    ),
    false,
  );
});

test('validateCatalogIntegrity: Seed-Katalog ist konsistent', () => {
  const catalog = baseCatalog();
  assert.doesNotThrow(() => validateCatalogIntegrity(catalog));
});

test('validateCatalogIntegrity: inaktive Journey-Templates mit toten Locations werden ignoriert', () => {
  const catalog = baseCatalog();
  catalog.journeyTemplates.push({
    id: 'journey_stale',
    name: 'Stale',
    topicId: null,
    active: false,
  });
  catalog.journeySteps.push({
    id: 'orphan_inactive_step',
    journeyTemplateId: 'journey_stale',
    sortOrder: 0,
    targetLocationId: 'location_does_not_exist',
    queueId: null,
    movementMode: 'call',
    publicDisplayMode: 'visible',
    completedWhen: 'arrive',
  });

  assert.doesNotThrow(() => validateCatalogIntegrity(catalog));
});

test('openDb: Seed-Katalog besteht Integritaetspruefung', () => {
  assert.doesNotThrow(() => openDb({ path: ':memory:' }));
});
