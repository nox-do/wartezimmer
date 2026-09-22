import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeJourneyStepPatch,
  formatStepFraction,
  isStepCompletedByAction,
  startNextJourneyStepPatch,
  stepToVisitPatch,
} from '@praxis-flow/flow-core';
import { escortTerminalInstruction } from '@praxis-flow/flow-core';

const room1 = { id: 'room_1', name: 'Raum 1', publicName: 'Raum 1' };

test('formatStepFraction: 1-basierte Anzeige ohne Steps-Array', () => {
  assert.equal(formatStepFraction(0, 3), '1/3');
  assert.equal(formatStepFraction(2, 3), '3/3');
  assert.equal(formatStepFraction(3, 3), null);
});

test('stepToVisitPatch: ohne Escort-Remap keine terminalInstruction', () => {
  const patch = stepToVisitPatch(
    {
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    { effectiveEscortPolicy: 'none' },
    { baseInstruction: 'Bitte nehmen Sie im Wartezimmer Platz.' },
  );

  assert.equal(patch.movementMode, 'call');
  assert.equal(patch.terminalInstruction, undefined);
});

test('stepToVisitPatch: instructionText wird als terminalInstruction übernommen', () => {
  const patch = stepToVisitPatch(
    {
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
      instructionText: '  Bitte melden Sie sich am Empfang.  ',
    },
    { effectiveEscortPolicy: 'none' },
  );

  assert.equal(patch.terminalInstruction, 'Bitte melden Sie sich am Empfang.');
});

test('stepToVisitPatch: escort required mappt self_go auf pickup', () => {
  const patch = stepToVisitPatch(
    {
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'self_go',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
    { effectiveEscortPolicy: 'required' },
    { targetLocation: room1, baseInstruction: 'Bitte gehen Sie direkt zu Raum 1.' },
  );

  assert.equal(patch.movementMode, 'pickup');
  assert.equal(patch.status, 'waiting');
  assert.equal(patch.terminalInstruction, escortTerminalInstruction('Raum 1'));
});

test('isStepCompletedByAction respektiert completedWhen', () => {
  const step = { completedWhen: 'arrive' };
  assert.equal(isStepCompletedByAction(step, 'arrive'), true);
  assert.equal(isStepCompletedByAction(step, 'start'), false);
  assert.equal(isStepCompletedByAction(undefined, 'arrive'), false);
});

test('startNextJourneyStepPatch: letzter Schritt setzt journeyStepIndex auf null', () => {
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 1,
    effectiveEscortPolicy: 'none',
    status: 'arrived',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [room1] });
  assert.deepEqual(patch, {
    journeyStepIndex: null,
    journeyStepCompletedAt: null,
    journeyState: 'completed',
  });
});

test('startNextJourneyStepPatch: call-Step setzt Aufruf-Text, nicht Geh-Text', () => {
  const reception = { id: 'reception', name: 'Empfang', publicName: 'Empfang' };
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'called',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [reception, room1] });
  assert.equal(patch.movementMode, 'call');
  assert.equal(patch.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
  assert.doesNotMatch(patch.terminalInstruction, /gehen Sie zu/);
});

test('completeJourneyStepPatch: completedWhen wird respektiert', () => {
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'self_go',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'required',
    status: 'called',
  };

  assert.equal(
    completeJourneyStepPatch(visit, 'call', steps, {
      completedAt: '2026-07-04T10:00:00.000Z',
      locations: [room1],
    }),
    null,
  );

  const patch = completeJourneyStepPatch(visit, 'arrive', steps, {
    completedAt: '2026-07-04T10:00:00.000Z',
    locations: [room1],
  });
  assert.deepEqual(patch, { journeyStepCompletedAt: '2026-07-04T10:00:00.000Z' });
});

test('startNextJourneyStepPatch: pending pickup-Step wird angewendet', () => {
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'self_go',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    journeyStepCompletedAt: '2026-07-04T10:00:00.000Z',
    effectiveEscortPolicy: 'required',
    status: 'called',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [room1] });
  assert.equal(patch.journeyStepIndex, 1);
  assert.equal(patch.targetLocationId, 'room_1');
  assert.equal(patch.movementMode, 'pickup');
  assert.equal(patch.journeyStepCompletedAt, null);
  assert.equal(patch.terminalInstruction, escortTerminalInstruction('Raum 1'));
});

test('startNextJourneyStepPatch: neuer Step setzt arrivedAt zurueck', () => {
  const reception = { id: 'reception', name: 'Empfang', publicName: 'Empfang' };
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'arrived',
    arrivedAt: '2026-07-04T10:00:00.000Z',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [reception] });
  assert.equal(patch.arrivedAt, null);
  assert.equal(patch.calledAt, null);
  assert.equal(patch.startedAt, null);
});

test('startNextJourneyStepPatch: instructionText des naechsten Steps', () => {
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
      instructionText: 'Bitte nehmen Sie im Behandlungsraum Platz.',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'called',
  };

  const patch = startNextJourneyStepPatch(visit, steps, {
    locations: [{ id: 'room_1', name: 'Raum 1' }],
  });
  assert.equal(patch.terminalInstruction, 'Bitte nehmen Sie im Behandlungsraum Platz.');
});

test('startNextJourneyStepPatch: Same-Target-Step setzt Warte-Hinweis ohne instructionText', () => {
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'arrived',
    lastKnownLocationId: 'room_1',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [room1] });
  assert.equal(patch.status, 'arrived');
  assert.equal(patch.terminalInstruction, 'Bitte warten Sie im Raum.');
});

test('startNextJourneyStepPatch: Same-Target arrive-Step wird implizit abgeschlossen', () => {
  const completedAt = '2026-07-04T10:05:00.000Z';
  const steps = [
    {
      sortOrder: 0,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
    },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'arrive',
    },
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    journeyStepCompletedAt: '2026-07-04T10:00:00.000Z',
    effectiveEscortPolicy: 'none',
    status: 'arrived',
    lastKnownLocationId: 'room_1',
  };

  const patch = startNextJourneyStepPatch(visit, steps, { locations: [room1], completedAt });
  assert.equal(patch.status, 'arrived');
  assert.equal(patch.arrivedAt, completedAt);
  assert.equal(patch.journeyStepCompletedAt, completedAt);
});

test('startNextJourneyStepPatch: ohne Journey-Cursor kein Patch', () => {
  assert.equal(
    startNextJourneyStepPatch({ journeyTemplateId: null, journeyStepIndex: null }, []),
    null,
  );
});
