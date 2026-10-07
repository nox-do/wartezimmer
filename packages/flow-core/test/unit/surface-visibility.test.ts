import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explainVisibility,
  isVisitVisibleOnSurface,
  matchingSurfaceDisplayRules,
  resolveSurfaceDisplayRule,
  ruleSpecificity,
} from '@wartezimmer/flow-core';

const surfaces = {
  waiting_tv: { id: 'waiting_tv', locationId: 'waiting_general', type: 'public_display' },
  panel_vaccine: { id: 'panel_vaccine', locationId: 'vaccine_room', type: 'staff_panel' },
  panel_lab: { id: 'panel_lab', locationId: 'lab', type: 'staff_panel' },
  panel_room_1: { id: 'panel_room_1', locationId: 'room_1', type: 'staff_panel' },
};

const rules = {
  waiting_tv: [
    {
      id: 'tv_general',
      queueId: 'general_queue',
      locationId: null,
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
    {
      id: 'tv_infection',
      queueId: 'infection_queue',
      locationId: null,
      topicId: null,
      displayMode: 'hidden',
      sortOrder: 20,
    },
    {
      id: 'tv_reception',
      queueId: 'reception_queue',
      locationId: null,
      topicId: null,
      displayMode: 'hidden',
      sortOrder: 30,
    },
  ],
  panel_vaccine: [
    {
      id: 'panel_vaccine',
      queueId: 'vaccine_queue',
      locationId: 'vaccine_room',
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
  ],
  panel_lab: [
    {
      id: 'panel_lab',
      queueId: 'lab_queue',
      locationId: 'lab',
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
  ],
  panel_room_1: [
    {
      id: 'panel_room_1',
      queueId: null,
      locationId: 'room_1',
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
  ],
};

test('Impfung: sichtbar auf panel_vaccine, nicht auf waiting_tv', () => {
  const visit = {
    primaryTopicId: 'vaccine',
    queueId: 'vaccine_queue',
    targetLocationId: 'vaccine_room',
    lastKnownLocationId: 'entrance',
    status: 'directed',
    publicDisplayMode: 'hidden',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.panel_vaccine, rules.panel_vaccine), true);
  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('Infekt: nie auf Wartezimmer-TV, auch bei publicDisplayMode visible', () => {
  const visit = {
    primaryTopicId: 'infection',
    queueId: 'infection_queue',
    targetLocationId: 'waiting_infection',
    lastKnownLocationId: 'waiting_infection',
    status: 'waiting',
    publicDisplayMode: 'visible',
  };

  const explanation = explainVisibility(visit, surfaces.waiting_tv, rules.waiting_tv);
  assert.equal(explanation.visible, false);
  assert.equal(explanation.rule?.id, 'tv_infection');
  assert.match(explanation.reason, /Versteckt wegen Regel tv_infection/);
});

test('Blutabnahme: sichtbar auf panel_lab, nicht auf waiting_tv (lastKnown=lab)', () => {
  const visit = {
    primaryTopicId: 'blood',
    queueId: 'lab_queue',
    targetLocationId: 'lab',
    lastKnownLocationId: 'lab',
    status: 'waiting',
    publicDisplayMode: 'visible',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.panel_lab, rules.panel_lab), true);
  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('Allgemein: sichtbar auf waiting_tv nur wenn Patient im Wartezimmer', () => {
  const inWaiting = {
    primaryTopicId: 'general',
    queueId: 'general_queue',
    targetLocationId: 'reception',
    lastKnownLocationId: 'waiting_general',
    status: 'waiting',
    publicDisplayMode: 'visible',
  };
  const atLab = {
    ...inWaiting,
    lastKnownLocationId: 'lab',
    targetLocationId: 'lab',
    queueId: 'lab_queue',
  };

  assert.equal(isVisitVisibleOnSurface(inWaiting, surfaces.waiting_tv, rules.waiting_tv), true);
  assert.equal(isVisitVisibleOnSurface(atLab, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('call_only auf TV: erst bei status called', () => {
  const visit = {
    primaryTopicId: 'general',
    queueId: 'general_queue',
    targetLocationId: 'reception',
    lastKnownLocationId: 'waiting_general',
    status: 'waiting',
    publicDisplayMode: 'call_only',
  };
  const tvRules = [
    {
      id: 'tv_general',
      queueId: 'general_queue',
      locationId: null,
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
  ];

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, tvRules), false);
  assert.equal(
    isVisitVisibleOnSurface({ ...visit, status: 'called' }, surfaces.waiting_tv, tvRules),
    true,
  );
});

test('Staff Panel: publicDisplayMode hidden blockiert nicht', () => {
  const visit = {
    primaryTopicId: 'general',
    queueId: null,
    targetLocationId: 'room_1',
    lastKnownLocationId: 'room_1',
    status: 'in_progress',
    publicDisplayMode: 'hidden',
  };

  const explanation = explainVisibility(visit, surfaces.panel_room_1, rules.panel_room_1);
  assert.equal(explanation.visible, true);
  assert.match(explanation.reason, /Sichtbar wegen Regel panel_room_1/);
});

test('Redirect auf Raum ohne Panel: nicht auf bestehenden Panels', () => {
  const visit = {
    primaryTopicId: 'general',
    queueId: 'general_queue',
    targetLocationId: 'room_2',
    lastKnownLocationId: 'room_2',
    status: 'waiting',
    publicDisplayMode: 'visible',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.panel_room_1, rules.panel_room_1), false);
  assert.equal(isVisitVisibleOnSurface(visit, surfaces.panel_vaccine, rules.panel_vaccine), false);
});

test('Raum 1 Journey: sichtbar auf panel_room_1 nach Ankunft', () => {
  const visit = {
    primaryTopicId: 'general',
    queueId: null,
    targetLocationId: 'room_1',
    lastKnownLocationId: 'room_1',
    status: 'in_progress',
    publicDisplayMode: 'hidden',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.panel_room_1, rules.panel_room_1), true);
});

test('Konfliktaufloesung: hidden schlaegt visible bei gleicher Spezifitaet', () => {
  const visit = {
    primaryTopicId: 'general',
    queueId: 'general_queue',
    targetLocationId: 'reception',
    lastKnownLocationId: 'waiting_general',
    status: 'waiting',
    publicDisplayMode: 'visible',
  };
  const conflicting = [
    {
      id: 'visible_rule',
      queueId: 'general_queue',
      locationId: null,
      topicId: null,
      displayMode: 'visible',
      sortOrder: 10,
    },
    {
      id: 'hidden_rule',
      queueId: 'general_queue',
      locationId: null,
      topicId: null,
      displayMode: 'hidden',
      sortOrder: 20,
    },
  ];

  const resolved = resolveSurfaceDisplayRule(matchingSurfaceDisplayRules(visit, conflicting));
  assert.equal(resolved?.displayMode, 'hidden');
  assert.equal(explainVisibility(visit, surfaces.waiting_tv, conflicting).visible, false);
});

test('Konfliktaufloesung: spezifisch schlaegt allgemein', () => {
  const general = {
    id: 'broad',
    queueId: 'general_queue',
    locationId: null,
    topicId: null,
    displayMode: 'hidden',
    sortOrder: 5,
  };
  const specific = {
    id: 'narrow',
    queueId: 'general_queue',
    locationId: 'waiting_general',
    topicId: 'general',
    displayMode: 'visible',
    sortOrder: 99,
  };

  assert.ok(ruleSpecificity(specific) > ruleSpecificity(general));
  assert.equal(resolveSurfaceDisplayRule([general, specific])?.id, 'narrow');
});

test('directed + visible: nicht als öffentlicher Aufruf sichtbar', () => {
  const visit = {
    primaryTopicId: 'blood',
    queueId: null,
    targetLocationId: 'lab',
    lastKnownLocationId: 'reception',
    status: 'directed',
    movementMode: 'self_go',
    publicDisplayMode: 'visible',
  };

  const explanation = explainVisibility(visit, surfaces.waiting_tv, rules.waiting_tv);
  assert.equal(explanation.visible, false);
  assert.match(explanation.reason, /self_go/);
});

test('directed + visible: auch am Display-Standort nicht als öffentlicher Aufruf sichtbar', () => {
  const visit = {
    primaryTopicId: 'blood',
    queueId: 'general_queue',
    targetLocationId: 'lab',
    lastKnownLocationId: 'waiting_general',
    status: 'directed',
    movementMode: 'self_go',
    publicDisplayMode: 'visible',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('directed + hidden: nicht auf waiting_tv', () => {
  const visit = {
    primaryTopicId: 'blood',
    queueId: null,
    targetLocationId: 'lab',
    lastKnownLocationId: 'reception',
    status: 'directed',
    movementMode: 'self_go',
    publicDisplayMode: 'hidden',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('pickup + visible: nicht auf standortfremdem waiting_tv', () => {
  const visit = {
    primaryTopicId: 'blood',
    queueId: null,
    targetLocationId: 'lab',
    lastKnownLocationId: 'reception',
    status: 'waiting',
    movementMode: 'pickup',
    publicDisplayMode: 'visible',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), false);
});

test('pickup + visible: lokal auch ohne Queue-Regel auf waiting_tv', () => {
  const visit = {
    primaryTopicId: 'mfa_assist',
    queueId: null,
    targetLocationId: 'lab',
    lastKnownLocationId: 'waiting_general',
    status: 'waiting',
    movementMode: 'pickup',
    publicDisplayMode: 'visible',
  };

  assert.equal(isVisitVisibleOnSurface(visit, surfaces.waiting_tv, rules.waiting_tv), true);
});
