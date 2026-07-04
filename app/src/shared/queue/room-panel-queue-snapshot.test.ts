import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreDatabase } from '../db/database.js';
import {
  buildRoomPanelQueueSnapshot,
  compareRoomPanelCallOrder,
} from './room-panel-queue-snapshot.js';

function dbForSnapshot(): CoreDatabase {
  return {
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: false,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        },
      ],
    }),
    listQueue: () => [
      {
        id: 'A-001',
        laneCode: 'A',
        number: 1,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T08:00:00.000Z',
        calledAt: '2026-06-18T09:00:00.000Z',
        identityRef: 'M. Beispiel',
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'A-002',
        laneCode: 'A',
        number: 2,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'empfang',
        destinationRoomLabel: 'Empfang',
        status: 'called',
        createdAt: '2026-06-18T08:01:00.000Z',
        calledAt: '2026-06-18T09:01:00.000Z',
        identityRef: 'Andere Person',
        checkinPhone: null,
        roomId: 'empfang',
        roomLabel: 'Empfang',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'A-003',
        laneCode: 'A',
        number: 3,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'done',
        createdAt: '2026-06-18T08:02:00.000Z',
        calledAt: '2026-06-18T09:02:00.000Z',
        identityRef: 'Fertig',
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
    ],
  } as unknown as CoreDatabase;
}

test('buildRoomPanelQueueSnapshot filters to session room and hides names by default', () => {
  const snapshot = buildRoomPanelQueueSnapshot(dbForSnapshot(), 7, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.equal(snapshot.view, 'room-panel');
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.roomId, 'labor');
  assert.equal(snapshot.roomLabel, 'Labor');
  assert.deepEqual(
    snapshot.items.map((item) => item.ticketId),
    ['A-001'],
  );
  assert.equal('identityRef' in snapshot.items[0]!, false);
});

test('buildRoomPanelQueueSnapshot includes identityRef only when room setting allows names', () => {
  const db = {
    ...dbForSnapshot(),
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: true,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const snapshot = buildRoomPanelQueueSnapshot(db, 8, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.equal(snapshot.items[0]?.identityRef, 'M. Beispiel');
});

test('buildRoomPanelQueueSnapshot sorts room items by calledAt, not check-in time', () => {
  const db = {
    ...dbForSnapshot(),
    listQueue: () => [
      {
        id: 'M-003',
        laneCode: 'M',
        number: 3,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T07:00:00.000Z',
        calledAt: '2026-06-18T09:20:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'M-001',
        laneCode: 'M',
        number: 1,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T08:00:00.000Z',
        calledAt: '2026-06-18T09:00:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'M-002',
        laneCode: 'M',
        number: 2,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'in_room',
        createdAt: '2026-06-18T08:30:00.000Z',
        calledAt: '2026-06-18T09:10:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
    ],
  } as unknown as CoreDatabase;

  const snapshot = buildRoomPanelQueueSnapshot(db, 9, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.deepEqual(
    snapshot.items.map((item) => item.ticketId),
    ['M-001', 'M-002', 'M-003'],
  );
});

test('compareRoomPanelCallOrder falls back to createdAt when calledAt is missing', () => {
  assert.ok(
    compareRoomPanelCallOrder(
      { calledAt: null, createdAt: '2026-06-18T08:00:00.000Z' },
      { calledAt: null, createdAt: '2026-06-18T09:00:00.000Z' },
    ) < 0,
  );
});
