import { describe, expect, it } from 'vitest';
import type { QueueItem } from './types';
import { getQueueZone, partitionQueueItems } from './queue-zones';

function item(visitId: string, status: QueueItem['status']): QueueItem {
  return {
    visitId,
    laneCode: 'A',
    number: 1,
    topicId: 'offen',
    status,
    roomId: null,
    roomLabel: null,
    arrivedAt: '2026-09-07T10:00:00.000Z',
    waitMs: 0,
    documentCount: 0,
    checkinPhone: null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    hasMobilePhone: false,
    returnUntil: null,
    needsAssistance: false,
  };
}

describe('MFA queue zones', () => {
  it('keeps waiting in the waiting room and puts called/directed underway', () => {
    expect(getQueueZone('waiting')).toBe('waiting');
    expect(getQueueZone('called')).toBe('active');
    expect(getQueueZone('directed')).toBe('active');
    expect(getQueueZone('in_room')).toBe('active');

    const zones = partitionQueueItems([
      item('waiting', 'waiting'),
      item('called', 'called'),
      item('directed', 'directed'),
      item('arrived', 'in_room'),
    ]);
    expect(zones.waiting.map((entry) => entry.visitId)).toEqual(['waiting']);
    expect(zones.active.map((entry) => entry.visitId)).toEqual(['called', 'directed', 'arrived']);
  });
});
