import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRedirectVisitPatch } from '@praxis-flow/flow-core';

test('resolveRedirectVisitPatch: instructed behaelt lastKnown, setzt Terminal-Default', () => {
  const current = {
    lastKnownLocationId: 'waiting_general',
    terminalInstruction: 'Alter Hinweis',
    status: 'called',
    movementMode: 'call',
    needsAssistance: false,
  };
  const patch = resolveRedirectVisitPatch(
    current,
    {
      queueId: 'lab_queue',
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible',
    },
    { targetLocation: { name: 'Labor' } },
  );

  assert.equal('lastKnownLocationId' in patch, false);
  assert.equal(patch.locationConfidence, 'instructed');
  assert.equal(patch.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
});

test('resolveRedirectVisitPatch: confirmed setzt lastKnown auf Ziel', () => {
  const patch = resolveRedirectVisitPatch(
    {
      lastKnownLocationId: 'waiting_general',
      terminalInstruction: 'x',
      status: 'waiting',
      movementMode: 'call',
    },
    {
      queueId: null,
      targetLocationId: 'room_1',
      movementMode: 'pickup',
      publicDisplayMode: 'hidden',
      locationSemantics: 'confirmed',
    },
    { targetLocation: { name: 'Raum 1' } },
  );

  assert.equal(patch.lastKnownLocationId, 'room_1');
  assert.equal(patch.locationConfidence, 'confirmed');
  assert.match(patch.terminalInstruction, /begleitet/);
});

test('resolveRedirectVisitPatch: unknown kann lastKnown explizit nullen', () => {
  const patch = resolveRedirectVisitPatch(
    {
      lastKnownLocationId: 'waiting_general',
      terminalInstruction: 'x',
      status: 'waiting',
      movementMode: 'call',
    },
    {
      queueId: null,
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      locationSemantics: 'unknown',
      lastKnownLocationId: null,
    },
    { targetLocation: { name: 'Labor' } },
  );

  assert.equal(patch.lastKnownLocationId, null);
  assert.equal(patch.locationConfidence, 'assumed');
});

test('resolveRedirectVisitPatch: Default ersetzt stale instruction', () => {
  const patch = resolveRedirectVisitPatch(
    {
      lastKnownLocationId: 'waiting_general',
      terminalInstruction: 'Alter Check-in-Text',
      status: 'waiting',
      movementMode: 'call',
      needsAssistance: false,
    },
    {
      queueId: 'lab_queue',
      targetLocationId: 'lab',
      movementMode: 'call',
      publicDisplayMode: 'visible',
    },
    { targetLocation: { name: 'Labor' } },
  );

  assert.equal(patch.terminalInstruction, 'Bitte warten Sie. Sie werden aufgerufen.');
  assert.notEqual(patch.terminalInstruction, 'Alter Check-in-Text');
});
