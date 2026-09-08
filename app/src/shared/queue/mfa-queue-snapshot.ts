import type { CoreDatabase } from '../db/database.js';

export type MfaQueueSnapshot = {
  revision: number;
  view: 'mfa';
  items: Array<{
    visitId: string;
    laneCode: string;
    number: number;
    topicId: string;
    topicLabel: string;
    destinationRoomId: string | null;
    destinationRoomLabel: string | null;
    status: string;
    roomId: string | null;
    roomLabel: string | null;
    journeyStepCompletedAt: string | null;
    startedAt: string | null;
    arrivedAt: string;
    waitMs: number;
    documentCount: number;
    hasMobilePhone: boolean;
    checkinPhone: string | null;
    callbackPhone: string | null;
    recallNotifyErrorCode: string | null;
    recallNotifySent: boolean;
    identityRef: string | null;
    identityRefEditable: boolean;
    returnUntil: string | null;
    triageLevel: string | null;
    needsAssistance: boolean;
    terminalAssistancePending: boolean;
    escortTransferPending: boolean;
    movementMode: 'call' | 'self_go' | 'pickup' | null;
  }>;
  checkinLocked: boolean;
  serverTime: string;
};

export function mfaQueueSnapshotStatus(item: {
  status: string;
  escortTransferPending: boolean;
}): string {
  return item.escortTransferPending ? 'in_room' : item.status;
}

export function buildMfaQueueSnapshot(
  db: CoreDatabase,
  revision: number,
  nowMs = Date.now(),
): MfaQueueSnapshot {
  const queueItems = db.listQueue();

  const items = queueItems.map((item) => {
    const createdMs = Date.parse(item.createdAt);
    const waitMs = Number.isNaN(createdMs) ? 0 : Math.max(0, nowMs - createdMs);
    const callbackPhone = item.callbackPhone?.trim() || null;
    const checkinPhone = item.checkinPhone?.trim() || null;
    const identityRef = item.identityRef?.trim() || null;
    const returnUntil = item.returnUntil?.trim() || null;

    return {
      visitId: item.id,
      laneCode: item.laneCode,
      number: item.number,
      topicId: item.topicId,
      topicLabel: item.topicLabel,
      destinationRoomId: item.destinationRoomId,
      destinationRoomLabel: item.destinationRoomLabel,
      status: mfaQueueSnapshotStatus(item),
      roomId: item.roomId,
      roomLabel: item.roomLabel,
      journeyStepCompletedAt: item.journeyStepCompletedAt,
      startedAt: item.startedAt,
      arrivedAt: item.createdAt,
      waitMs,
      documentCount: item.documentCount,
      hasMobilePhone: callbackPhone != null || checkinPhone != null,
      checkinPhone,
      callbackPhone,
      recallNotifyErrorCode: item.recallNotifyErrorCode?.trim() || null,
      recallNotifySent: Boolean(item.recallNotifySent),
      identityRef,
      identityRefEditable: item.identityRefEditable === true,
      returnUntil,
      triageLevel: item.triageLevel?.trim() || null,
      needsAssistance: item.needsAssistance,
      terminalAssistancePending: item.terminalAssistancePending,
      escortTransferPending: item.escortTransferPending,
      movementMode: item.movementMode ?? null,
    };
  });

  return {
    revision,
    view: 'mfa',
    items,
    checkinLocked: db.isEffectiveCheckinLocked(),
    serverTime: new Date(nowMs).toISOString(),
  };
}
