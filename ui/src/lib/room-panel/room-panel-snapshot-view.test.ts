import { describe, expect, it } from 'vitest';
import {
  formatRoomPanelTicketCode,
  resolveRoomPanelLeadState,
  roomPanelCallCandidates,
  roomPanelCandidateDisplayName,
  shouldRenderRoomPanelCallSection,
} from './room-panel-snapshot-view';
import type { RoomPanelSnapshot } from '$lib/queue/openapi-types';

function snapshot(partial: Partial<RoomPanelSnapshot> = {}): RoomPanelSnapshot {
  return {
    view: 'room-panel',
    roomId: 'labor',
    roomLabel: 'Labor',
    revision: 1,
    serverTime: '2026-07-12T10:00:00.000Z',
    capabilities: {
      requiresPin: true,
      canCheckIn: true,
      canCheckOut: true,
      mayShowPatientNames: false,
      canCall: false,
    },
    panel: {
      placement: 'inside',
      mode: 'staff_full',
      showPatientNames: false,
      calledText: 'Bitte eintreten.',
      arrivedText: 'Bitte warten.',
    },
    items: [],
    ...partial,
  };
}

describe('roomPanelCallCandidates', () => {
  it('returns empty list for outside panels without canCall', () => {
    const data = snapshot({
      capabilities: {
        requiresPin: false,
        canCheckIn: true,
        canCheckOut: false,
        mayShowPatientNames: false,
        canCall: false,
      },
      panel: {
        placement: 'outside',
        mode: 'arrival',
        showPatientNames: false,
        calledText: 'Bitte eintreten.',
        arrivedText: 'Bitte warten.',
      },
      callCandidates: [
        {
          visitId: 'v1',
          laneCode: 'A',
          number: 7,
          status: 'waiting',
          roomId: 'labor',
          roomLabel: 'Labor',
          actions: { canCall: true },
        },
      ],
    });

    expect(roomPanelCallCandidates(data)).toEqual([]);
    expect(shouldRenderRoomPanelCallSection(data)).toBe(false);
  });

  it('preserves backend FIFO order for inside canCall panels', () => {
    const candidates = [
      {
        visitId: 'v-old',
        laneCode: 'A',
        number: 1,
        status: 'waiting' as const,
        roomId: 'labor',
        roomLabel: 'Labor',
        actions: { canCall: true },
      },
      {
        visitId: 'v-new',
        laneCode: 'B',
        number: 2,
        status: 'waiting' as const,
        roomId: 'labor',
        roomLabel: 'Labor',
        actions: { canCall: true },
      },
    ];
    const data = snapshot({
      capabilities: {
        requiresPin: true,
        canCheckIn: true,
        canCheckOut: true,
        mayShowPatientNames: false,
        canCall: true,
      },
      callCandidates: candidates,
    });

    expect(roomPanelCallCandidates(data)).toEqual(candidates);
    expect(shouldRenderRoomPanelCallSection(data)).toBe(true);
  });
});

describe('roomPanelCandidateDisplayName', () => {
  it('renders ticket-only when names are disabled', () => {
    expect(
      roomPanelCandidateDisplayName({ identityRef: 'Muster' }, false),
    ).toBeNull();
  });

  it('renders name only when policy allows and identityRef exists', () => {
    expect(
      roomPanelCandidateDisplayName({ identityRef: '  Muster  ' }, true),
    ).toBe('Muster');
    expect(roomPanelCandidateDisplayName({ identityRef: null }, true)).toBeNull();
  });
});

describe('resolveRoomPanelLeadState', () => {
  it('prefers enter state when called or directed items exist', () => {
    expect(
      resolveRoomPanelLeadState([
        {
          visitId: 'v1',
          laneCode: 'A',
          number: 1,
          status: 'in_room',
          roomId: 'labor',
          roomLabel: 'Labor',
          actions: {},
        },
        {
          visitId: 'v2',
          laneCode: 'B',
          number: 2,
          status: 'directed',
          roomId: 'labor',
          roomLabel: 'Labor',
          actions: {},
        },
      ]),
    ).toBe('enter');
  });
});

describe('formatRoomPanelTicketCode', () => {
  it('formats lane and number for compact display', () => {
    expect(formatRoomPanelTicketCode('a', 42)).toBe('A-042');
  });
});
