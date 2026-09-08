import { describe, expect, it } from 'vitest';
import { resolveQueueDrop } from './queue-drop-resolver';

describe('resolveQueueDrop', () => {
  it('calls ticket when dropped from waiting onto a room', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't1', zone: 'waiting', status: 'waiting', roomId: null, movementMode: 'call' },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toEqual({
      action: 'call',
      visitId: 't1',
      room: { roomId: 'empfang', roomLabel: 'Empfang' },
    });
  });

  it('places directed or pickup tickets into the dropped room instead of calling', () => {
    expect(
      resolveQueueDrop(
        {
          visitId: 't1d',
          zone: 'active',
          status: 'directed',
          roomId: null,
          movementMode: 'self_go',
        },
        { kind: 'room', roomId: 'labor', roomLabel: 'Labor' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't1d',
      room: { roomId: 'labor', roomLabel: 'Labor' },
      confirmAssistance: false,
    });
    expect(
      resolveQueueDrop(
        {
          visitId: 't1p',
          zone: 'waiting',
          status: 'waiting',
          roomId: null,
          movementMode: 'pickup',
          needsAssistance: true,
        },
        { kind: 'room', roomId: 'labor', roomLabel: 'Labor' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't1p',
      room: { roomId: 'labor', roomLabel: 'Labor' },
      confirmAssistance: true,
    });
    expect(
      resolveQueueDrop(
        {
          visitId: 't1a',
          zone: 'waiting',
          status: 'waiting',
          roomId: null,
          movementMode: 'call',
          needsAssistance: true,
        },
        { kind: 'room', roomId: 'labor', roomLabel: 'Labor' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't1a',
      room: { roomId: 'labor', roomLabel: 'Labor' },
      confirmAssistance: true,
    });
  });

  it('reassigns when active ticket moves to another room', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't2', zone: 'active', status: 'in_room', roomId: 'empfang' },
        { kind: 'room', roomId: 'kirche', roomLabel: 'kirche' },
      ),
    ).toEqual({
      action: 'reassign',
      visitId: 't2',
      room: { roomId: 'kirche', roomLabel: 'kirche' },
    });
  });

  it('continues a completed journey step with the dropped room as target', () => {
    expect(
      resolveQueueDrop(
        {
          visitId: 't2-continue',
          zone: 'active',
          status: 'in_room',
          roomId: 'empfang',
          journeyStepCompleted: true,
        },
        { kind: 'room', roomId: 'labor', roomLabel: 'Labor' },
      ),
    ).toEqual({
      action: 'continue-journey',
      visitId: 't2-continue',
      room: { roomId: 'labor', roomLabel: 'Labor' },
    });
  });

  it('places an assisted completed journey step after confirmation', () => {
    expect(
      resolveQueueDrop(
        {
          visitId: 't2-assisted-continue',
          zone: 'active',
          status: 'in_room',
          roomId: 'empfang',
          journeyStepCompleted: true,
          needsAssistance: true,
        },
        { kind: 'room', roomId: 'labor', roomLabel: 'Labor' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't2-assisted-continue',
      room: { roomId: 'labor', roomLabel: 'Labor' },
      confirmAssistance: true,
    });
  });

  it('places an arrived assisted ticket immediately in the new room', () => {
    expect(
      resolveQueueDrop(
        {
          visitId: 't2-assisted',
          zone: 'active',
          status: 'in_room',
          roomId: 'labor',
          needsAssistance: true,
        },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't2-assisted',
      room: { roomId: 'empfang', roomLabel: 'Empfang' },
      confirmAssistance: true,
    });
  });

  it('marks an underway drop as arrival in the selected room', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't2u', zone: 'active', status: 'called', roomId: 'empfang' },
        { kind: 'room', roomId: 'kirche', roomLabel: 'kirche' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't2u',
      room: { roomId: 'kirche', roomLabel: 'kirche' },
      confirmAssistance: false,
    });
  });

  it('asks for assistance confirmation before placing an escorted transfer', () => {
    expect(
      resolveQueueDrop(
        {
          visitId: 't2a',
          zone: 'active',
          status: 'in_room',
          roomId: 'empfang',
          movementMode: 'pickup',
          needsAssistance: true,
          escortTransferPending: true,
        },
        { kind: 'room', roomId: 'kirche', roomLabel: 'kirche' },
      ),
    ).toEqual({
      action: 'place-in-room',
      visitId: 't2a',
      room: { roomId: 'kirche', roomLabel: 'kirche' },
      confirmAssistance: true,
    });
  });

  it('returns ticket to waiting when active ticket is dropped on waiting zone', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't3', zone: 'active', status: 'in_room', roomId: 'empfang' },
        { kind: 'waiting' },
      ),
    ).toEqual({ action: 'return-to-waiting', visitId: 't3' });
  });

  it('opens mark-away when waiting ticket is dropped on away zone', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't6', zone: 'waiting', status: 'waiting', roomId: null },
        { kind: 'away' },
      ),
    ).toEqual({ action: 'mark-away', visitId: 't6' });
  });

  it('ignores active-to-away drops', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't7', zone: 'active', status: 'called', roomId: 'empfang' },
        { kind: 'away' },
      ),
    ).toBeNull();
  });

  it('ignores same-room drops and waiting-to-waiting', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't4', zone: 'active', status: 'in_room', roomId: 'empfang' },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toBeNull();

    expect(
      resolveQueueDrop(
        { visitId: 't5', zone: 'waiting', status: 'waiting', roomId: null },
        { kind: 'waiting' },
      ),
    ).toBeNull();
  });
});
