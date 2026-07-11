import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceJourneyPatch,
  formatStepFraction,
  shouldAdvanceOn,
  stepToVisitPatch
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
      completedWhen: 'arrive'
    },
    { effectiveEscortPolicy: 'none' },
    { baseInstruction: 'Bitte nehmen Sie im Wartezimmer Platz.' }
  );

  assert.equal(patch.movementMode, 'call');
  assert.equal(patch.terminalInstruction, undefined);
});

test('stepToVisitPatch: escort required mappt self_go auf pickup', () => {
  const patch = stepToVisitPatch(
    {
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'self_go',
      publicDisplayMode: 'hidden',
      completedWhen: 'start'
    },
    { effectiveEscortPolicy: 'required' },
    { targetLocation: room1, baseInstruction: 'Bitte gehen Sie direkt zu Raum 1.' }
  );

  assert.equal(patch.movementMode, 'pickup');
  assert.equal(patch.status, 'waiting');
  assert.equal(patch.terminalInstruction, escortTerminalInstruction('Raum 1'));
});

test('shouldAdvanceOn respektiert completedWhen', () => {
  const step = { completedWhen: 'arrive' };
  assert.equal(shouldAdvanceOn(step, 'arrive'), true);
  assert.equal(shouldAdvanceOn(step, 'start'), false);
  assert.equal(shouldAdvanceOn(undefined, 'arrive'), false);
});

test('advanceJourneyPatch: letzter Schritt setzt journeyStepIndex auf null', () => {
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'call', publicDisplayMode: 'hidden', completedWhen: 'start' }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 1,
    effectiveEscortPolicy: 'none',
    status: 'arrived'
  };

  const patch = advanceJourneyPatch(visit, 'start', steps, { locations: [room1] });
  assert.deepEqual(patch, { journeyStepIndex: null, journeyState: 'completed' });
});

test('advanceJourneyPatch: call-Step setzt Aufruf-Text, nicht Geh-Text', () => {
  const reception = { id: 'reception', name: 'Empfang', publicName: 'Empfang' };
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'call', publicDisplayMode: 'hidden', completedWhen: 'start' }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'called'
  };

  const patch = advanceJourneyPatch(visit, 'arrive', steps, { locations: [reception, room1] });
  assert.equal(patch.movementMode, 'call');
  assert.equal(patch.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
  assert.doesNotMatch(patch.terminalInstruction, /gehen Sie zu/);
});

test('advanceJourneyPatch: completedWhen wird respektiert', () => {
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'self_go', publicDisplayMode: 'hidden', completedWhen: 'start' }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'required',
    status: 'called'
  };

  assert.equal(advanceJourneyPatch(visit, 'call', steps, { locations: [room1] }), null);

  const patch = advanceJourneyPatch(visit, 'arrive', steps, { locations: [room1] });
  assert.equal(patch.journeyStepIndex, 1);
  assert.equal(patch.targetLocationId, 'room_1');
  assert.equal(patch.movementMode, 'pickup');
  assert.equal(patch.terminalInstruction, escortTerminalInstruction('Raum 1'));
});

test('advanceJourneyPatch: arrive-Advance behaelt arrivedAt', () => {
  const reception = { id: 'reception', name: 'Empfang', publicName: 'Empfang' };
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'call', publicDisplayMode: 'hidden', completedWhen: 'start' }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'arrived',
    arrivedAt: '2026-07-04T10:00:00.000Z'
  };

  const patch = advanceJourneyPatch(visit, 'arrive', steps, { locations: [reception] });
  assert.equal(patch.arrivedAt, undefined);
  assert.equal(patch.calledAt, null);
  assert.equal(patch.startedAt, null);
});

test('advanceJourneyPatch: instructionText des naechsten Steps', () => {
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    {
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: null,
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'start',
      instructionText: 'Bitte nehmen Sie im Behandlungsraum Platz.'
    }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'called'
  };

  const patch = advanceJourneyPatch(visit, 'arrive', steps, { locations: [{ id: 'room_1', name: 'Raum 1' }] });
  assert.equal(patch.terminalInstruction, 'Bitte nehmen Sie im Behandlungsraum Platz.');
});

test('advanceJourneyPatch: Same-Target-Advance setzt Warte-Hinweis ohne instructionText', () => {
  const steps = [
    { sortOrder: 0, targetLocationId: 'reception', queueId: 'general_queue', movementMode: 'call', publicDisplayMode: 'visible', completedWhen: 'arrive' },
    { sortOrder: 1, targetLocationId: 'room_1', queueId: null, movementMode: 'call', publicDisplayMode: 'hidden', completedWhen: 'start' }
  ];
  const visit = {
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
    effectiveEscortPolicy: 'none',
    status: 'arrived',
    lastKnownLocationId: 'room_1'
  };

  const patch = advanceJourneyPatch(visit, 'arrive', steps, { locations: [room1] });
  assert.equal(patch.status, 'arrived');
  assert.equal(patch.terminalInstruction, 'Bitte warten Sie im Raum.');
});

test('advanceJourneyPatch: ohne Journey-Cursor kein Patch', () => {
  assert.equal(
    advanceJourneyPatch({ journeyTemplateId: null, journeyStepIndex: null }, 'arrive', []),
    null
  );
});
