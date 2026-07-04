import type {
  QueueTicketRow,
  RoomPanelMode,
  RoomPanelSettings,
  RoomPanelTextPreset,
} from '../db/db-types.js';
import type { CoreDatabase } from '../db/database.js';
import type { RoomPanelSession } from '../../auth/staff-session-auth.js';
import {
  resolveRoomPanelForSession,
  roomPanelMayShowPatientNames,
} from '../room-panel/room-panel-policy.js';

const PRESET_TEXT: Record<RoomPanelTextPreset, string> = {
  you_are_right: 'Sie sind hier richtig.',
  please_wait_here: 'Bitte hier warten.',
  please_enter: 'Bitte eintreten.',
  go_to_reception: 'Bitte wenden Sie sich an den Empfang.',
  custom: '',
};

export type RoomPanelQueueSnapshot = {
  revision: number;
  view: 'room-panel';
  roomId: string;
  roomLabel: string;
  panel: {
    placement: RoomPanelSettings['placement'];
    mode: RoomPanelMode;
    showPatientNames: boolean;
    calledText: string;
    arrivedText: string;
  };
  items: Array<{
    ticketId: string;
    laneCode: string;
    number: number;
    status: 'called' | 'in_room';
    calledAt?: string;
    roomId: string;
    roomLabel: string;
    identityRef?: string | null;
  }>;
  serverTime: string;
};

function panelText(
  preset: RoomPanelTextPreset,
  custom: string | null,
  fallbackPreset: RoomPanelTextPreset,
): string {
  return preset === 'custom' ? custom?.trim() || PRESET_TEXT[fallbackPreset] : PRESET_TEXT[preset];
}

function roomPanelCallSortMs(item: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>): number {
  const calledMs = item.calledAt ? Date.parse(item.calledAt) : Number.NaN;
  if (!Number.isNaN(calledMs)) {
    return calledMs;
  }
  return Date.parse(item.createdAt);
}

/** Oldest room call first; falls back to check-in time when calledAt is missing. */
export function compareRoomPanelCallOrder(
  left: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>,
  right: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>,
): number {
  const byCall = roomPanelCallSortMs(left) - roomPanelCallSortMs(right);
  if (byCall !== 0) {
    return byCall;
  }
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

export function buildRoomPanelQueueSnapshot(
  db: CoreDatabase,
  revision: number,
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>,
): RoomPanelQueueSnapshot {
  const active = resolveRoomPanelForSession(db, session);
  if (!active) {
    throw new Error('ROOM_PANEL_SESSION_INVALID');
  }
  const { room, panel } = active;
  const roomLabel = room.roomLabel;
  const showPatientNames = roomPanelMayShowPatientNames(panel);

  const items = db
    .listQueue()
    .filter(
      (item): item is QueueTicketRow & { status: 'called' | 'in_room' } =>
        item.roomId === session.roomId && (item.status === 'called' || item.status === 'in_room'),
    )
    .sort(compareRoomPanelCallOrder)
    .map((item) => ({
      ticketId: item.id,
      laneCode: item.laneCode,
      number: item.number,
      status: item.status,
      ...(item.calledAt ? { calledAt: item.calledAt } : {}),
      roomId: session.roomId,
      roomLabel: item.roomLabel?.trim() || roomLabel,
      ...(showPatientNames ? { identityRef: item.identityRef?.trim() || null } : {}),
    }));

  return {
    revision,
    view: 'room-panel',
    roomId: session.roomId,
    roomLabel,
    panel: {
      placement: panel.placement,
      mode: panel.mode,
      showPatientNames,
      calledText: panelText(panel.calledTextPreset, panel.calledTextCustom, 'please_enter'),
      arrivedText: panelText(panel.arrivedTextPreset, panel.arrivedTextCustom, 'please_wait_here'),
    },
    items,
    serverTime: new Date().toISOString(),
  };
}
