import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEscortPolicyToMovementMode,
  effectiveEscortPolicy,
  escortTerminalInstruction,
  maxEscortPolicy,
  movementTerminalInstruction,
  resolveTerminalInstruction,
} from '@praxis-flow/flow-core';
import { resolveCheckInRouting } from '@praxis-flow/flow-core/server';

test('applyEscortPolicyToMovementMode: required verhindert self_go', () => {
  assert.equal(applyEscortPolicyToMovementMode('required', 'self_go'), 'pickup');
  assert.equal(applyEscortPolicyToMovementMode('required', 'call'), 'call');
  assert.equal(applyEscortPolicyToMovementMode('required', 'pickup'), 'pickup');
  assert.equal(applyEscortPolicyToMovementMode('none', 'self_go'), 'self_go');
  assert.equal(applyEscortPolicyToMovementMode('recommended', 'self_go'), 'self_go');
});

test('effectiveEscortPolicy: entspricht konfigurierter Policy', () => {
  assert.equal(effectiveEscortPolicy('recommended'), 'recommended');
  assert.equal(effectiveEscortPolicy('required'), 'required');
  assert.equal(maxEscortPolicy('none', 'recommended', 'required'), 'required');
});

test('resolveTerminalInstruction: self_go → pickup nutzt Escort-Text', () => {
  const result = resolveTerminalInstruction({
    baseInstruction: 'Bitte gehen Sie direkt zu Raum 1.',
    movementMode: 'pickup',
    originalMovementMode: 'self_go',
    targetLocation: { name: 'Raum 1', publicName: 'Raum 1' },
  });
  assert.equal(result, escortTerminalInstruction('Raum 1'));
  assert.doesNotMatch(result, /gehen Sie direkt/);
});

test('resolveTerminalInstruction: ohne Remap bleibt baseInstruction', () => {
  const base = 'Bitte nehmen Sie im Wartezimmer Platz.';
  assert.equal(
    resolveTerminalInstruction({
      baseInstruction: base,
      movementMode: 'call',
      originalMovementMode: 'call',
    }),
    base,
  );
});

test('movementTerminalInstruction: Text passt zu movementMode', () => {
  const room1 = { name: 'Raum 1', publicName: 'Raum 1' };

  assert.equal(
    movementTerminalInstruction({ movementMode: 'call', targetLocation: room1 }),
    'Bitte warten Sie. Sie werden aufgerufen.',
  );
  assert.equal(
    movementTerminalInstruction({ movementMode: 'self_go', targetLocation: room1 }),
    'Bitte gehen Sie zu Raum 1.',
  );
  assert.equal(
    movementTerminalInstruction({ movementMode: 'pickup', targetLocation: room1 }),
    escortTerminalInstruction('Raum 1'),
  );
});

test('resolveCheckInRouting: normale Rule ohne Overlay', () => {
  const routing = resolveCheckInRouting({
    selectedRule: {
      initialMovementMode: 'call',
      terminalInstructionTemplate: 'Wartezimmer',
      initialQueueId: 'general_queue',
      initialTargetLocationId: 'reception',
      initialLastKnownLocationId: 'waiting_general',
      initialLocationConfidence: 'assumed',
    },
    effectiveEscortPolicy: 'none',
    locations: [{ id: 'reception', name: 'Empfang', publicName: 'Empfang' }],
  });

  assert.equal(routing.movementMode, 'call');
  assert.equal(routing.queueId, 'general_queue');
  assert.equal(routing.targetLocationId, 'reception');
  assert.equal(routing.terminalInstruction, 'Wartezimmer');
});

test('resolveCheckInRouting: escort required + self_go → pickup + Escort-Text', () => {
  const routing = resolveCheckInRouting({
    selectedRule: {
      initialMovementMode: 'self_go',
      terminalInstructionTemplate: 'Bitte gehen Sie direkt zum Impfraum.',
      initialQueueId: 'vaccine_queue',
      initialTargetLocationId: 'vaccine_room',
      initialLastKnownLocationId: 'entrance',
      initialLocationConfidence: 'instructed',
    },
    effectiveEscortPolicy: 'required',
    locations: [{ id: 'vaccine_room', name: 'Impfraum', publicName: 'Impfraum' }],
  });

  assert.equal(routing.movementMode, 'pickup');
  assert.equal(routing.terminalInstruction, escortTerminalInstruction('Impfraum'));
});
