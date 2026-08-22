import { formatTicketCode } from '@praxis-flow/domain';
import type {
  RoomPanelCallCandidate,
  RoomPanelItem,
  RoomPanelSnapshot,
} from '$lib/queue/openapi-types';

export type RoomPanelLeadState = 'waiting' | 'enter' | 'arrival';

export function resolveRoomPanelLeadState(items: RoomPanelItem[]): RoomPanelLeadState {
  if (items.some((item) => item.status === 'called' || item.status === 'directed')) {
    return 'enter';
  }
  if (items.some((item) => item.status === 'in_room')) {
    return 'arrival';
  }
  return 'waiting';
}

export function resolveRoomPanelLeadLabel(
  state: RoomPanelLeadState,
  texts: {
    called: string;
    arrived: string;
  },
): string {
  return state === 'enter' ? texts.called : texts.arrived;
}

export function roomPanelCallCandidates(snapshot: RoomPanelSnapshot): RoomPanelCallCandidate[] {
  if (!snapshot.capabilities.canCall) {
    return [];
  }
  return snapshot.callCandidates ?? [];
}

export function shouldRenderRoomPanelCallSection(snapshot: RoomPanelSnapshot): boolean {
  return snapshot.capabilities.canCall === true;
}

/** Server-side WZ-TV presence — room-panel has no ops SSE; snapshot is authoritative. */
export function roomPanelCallAnnouncementReachable(snapshot: RoomPanelSnapshot): boolean {
  return snapshot.capabilities.callAnnouncementReachable !== false;
}

export function roomPanelItemTicketCodes(items: RoomPanelItem[]): string[] {
  return items.map((item) => formatTicketCode(item.laneCode, item.number));
}

export function roomPanelCandidateDisplayName(
  candidate: Pick<RoomPanelCallCandidate, 'identityRef'>,
  mayShowPatientNames: boolean,
): string | null {
  if (!mayShowPatientNames) {
    return null;
  }
  const name = candidate.identityRef?.trim();
  return name ? name : null;
}

export function roomPanelItemDisplayName(
  item: Pick<RoomPanelItem, 'identityRef'>,
  mayShowPatientNames: boolean,
): string | null {
  if (!mayShowPatientNames) {
    return null;
  }
  const name = item.identityRef?.trim();
  return name ? name : null;
}
