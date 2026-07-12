import { describe, expect, it } from 'vitest';
import {
  buildRoomPanelPath,
  buildRoomPanelUrl,
  findRequestedRoomEntry,
  shouldReconcileRequestedUrl,
  snapshotMatchesRequestedUrl,
} from './room-panel-requested-url';

const rooms = [
  { roomId: 'labor', placement: 'outside' as const, roomLabel: 'Labor' },
  { roomId: 'labor', placement: 'inside' as const, roomLabel: 'Labor' },
];

describe('findRequestedRoomEntry', () => {
  it('matches room and placement when placement is requested', () => {
    expect(findRequestedRoomEntry(rooms, 'labor', 'inside')?.placement).toBe('inside');
    expect(findRequestedRoomEntry(rooms, 'labor', 'outside')?.placement).toBe('outside');
  });

  it('returns first matching room when placement is omitted', () => {
    expect(findRequestedRoomEntry(rooms, 'labor', '')?.roomId).toBe('labor');
  });
});

describe('buildRoomPanelPath', () => {
  it('includes placement when provided', () => {
    expect(buildRoomPanelPath('labor', 'inside')).toBe('/room-panel?room=labor&placement=inside');
  });

  it('omits placement when not provided', () => {
    expect(buildRoomPanelPath('labor')).toBe('/room-panel?room=labor');
  });
});

describe('buildRoomPanelUrl', () => {
  it('prefixes with base URL when configured', () => {
    expect(buildRoomPanelUrl('labor', 'inside', 'http://192.168.1.10:8080')).toBe(
      'http://192.168.1.10:8080/room-panel?room=labor&placement=inside',
    );
  });
});

describe('snapshotMatchesRequestedUrl', () => {
  const insideSnapshot = {
    roomId: 'labor',
    panel: { placement: 'inside' as const },
  };

  it('matches room and placement when placement is requested', () => {
    expect(snapshotMatchesRequestedUrl(insideSnapshot, 'labor', 'inside')).toBe(true);
    expect(snapshotMatchesRequestedUrl(insideSnapshot, 'labor', 'outside')).toBe(false);
  });

  it('matches any placement for the room when placement is omitted', () => {
    expect(snapshotMatchesRequestedUrl(insideSnapshot, 'labor', '')).toBe(true);
  });
});

describe('shouldReconcileRequestedUrl', () => {
  it('requires reconcile when session placement differs from URL', () => {
    expect(
      shouldReconcileRequestedUrl(
        { roomId: 'labor', panel: { placement: 'outside' } },
        'labor',
        'inside',
      ),
    ).toBe(true);
  });

  it('skips reconcile when session already matches URL placement', () => {
    expect(
      shouldReconcileRequestedUrl(
        { roomId: 'labor', panel: { placement: 'inside' } },
        'labor',
        'inside',
      ),
    ).toBe(false);
  });
});
