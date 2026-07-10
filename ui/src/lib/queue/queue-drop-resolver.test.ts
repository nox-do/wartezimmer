import { describe, expect, it } from 'vitest';
import { resolveQueueDrop } from './queue-drop-resolver';

describe('resolveQueueDrop', () => {
  it('calls ticket when dropped from waiting onto a room', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't1', zone: 'waiting', status: 'waiting', roomId: null },
        { kind: 'room', roomId: 'empfang', roomLabel: 'Empfang' },
      ),
    ).toEqual({
      action: 'call',
      visitId: 't1',
      room: { roomId: 'empfang', roomLabel: 'Empfang' },
    });
  });

  it('reassigns when active ticket moves to another room', () => {
    expect(
      resolveQueueDrop(
        { visitId: 't2', zone: 'active', status: 'called', roomId: 'empfang' },
        { kind: 'room', roomId: 'kirche', roomLabel: 'kirche' },
      ),
    ).toEqual({
      action: 'reassign',
      visitId: 't2',
      room: { roomId: 'kirche', roomLabel: 'kirche' },
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
        { visitId: 't4', zone: 'active', status: 'called', roomId: 'empfang' },
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
