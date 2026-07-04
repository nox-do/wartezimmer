import { describe, expect, test } from 'vitest';
import { parseDevicePresenceOpsSnapshot } from './ops-stream-parse';

describe('parseDevicePresenceOpsSnapshot', () => {
  test('accepts room-panel presence events', () => {
    const snapshot = parseDevicePresenceOpsSnapshot({
      revision: 1,
      deviceId: 'room-panel:labor',
      kind: 'room-panel',
      status: 'online',
      streamConnected: true,
      lastSeenAt: '2026-06-19T12:00:00.000Z',
      serverTime: '2026-06-19T12:00:01.000Z',
    });

    expect(snapshot).toEqual({
      revision: 1,
      deviceId: 'room-panel:labor',
      kind: 'room-panel',
      status: 'online',
      streamConnected: true,
      lastSeenAt: '2026-06-19T12:00:00.000Z',
      serverTime: '2026-06-19T12:00:01.000Z',
    });
  });
});
