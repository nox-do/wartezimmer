import { describe, expect, it } from 'vitest';
import { resolveQueueDrop } from './queue-drop-resolver';

describe('resolveQueueDrop', () => {
  it('calls ticket when dropped from waiting onto a room', () => {
    expect(
      resolveQueueDrop(
        { ticketId: 't1', zone: 'waiting', status: 'waiting', roomId: null },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toEqual({
      action: 'call',
      ticketId: 't1',
      room: { roomId: 'empfang', roomLabel: 'Empfang' },
    });
  });

  it('reassigns when active ticket moves to another room', () => {
    expect(
      resolveQueueDrop(
        { ticketId: 't2', zone: 'active', status: 'called', roomId: 'empfang' },
        { kind: 'room', roomId: 'kirche', roomLabel: 'kirche' },
      ),
    ).toEqual({
      action: 'reassign',
      ticketId: 't2',
      room: { roomId: 'kirche', roomLabel: 'kirche' },
    });
  });

  it('returns ticket to waiting when active ticket is dropped on waiting zone', () => {
    expect(
      resolveQueueDrop(
        { ticketId: 't3', zone: 'active', status: 'in_room', roomId: 'empfang' },
        { kind: 'waiting' },
      ),
    ).toEqual({ action: 'return-to-waiting', ticketId: 't3' });
  });

  it('ignores same-room drops and waiting-to-waiting', () => {
    expect(
      resolveQueueDrop(
        { ticketId: 't4', zone: 'active', status: 'called', roomId: 'empfang' },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toBeNull();

    expect(
      resolveQueueDrop(
        { ticketId: 't5', zone: 'waiting', status: 'waiting', roomId: null },
        { kind: 'waiting' },
      ),
    ).toBeNull();
  });
});
