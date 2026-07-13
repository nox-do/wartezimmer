import { describe, expect, it } from 'vitest';
import {
  formatRoomPanelTicketCode,
  resolveRoomPanelLeadLabel,
  resolveRoomPanelLeadState,
  roomPanelCallAnnouncementReachable,
  roomPanelCallCandidates,
  roomPanelCandidateDisplayName,
  shouldRenderRoomPanelCallSection,
} from './room-panel-snapshot-view';
import { formatRoomPanelDisplayText } from './room-panel-text';
import type { RoomPanelSnapshot } from '$lib/queue/openapi-types';

const t = (key: string) => key;

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
      callAnnouncementReachable: true,
    },
    panel: {
      placement: 'inside',
      mode: 'staff_full',
      showPatientNames: false,
      calledTextPreset: 'please_enter',
      calledTextCustom: null,
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
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
        callAnnouncementReachable: true,
      },
      panel: {
        placement: 'outside',
        mode: 'arrival',
        showPatientNames: false,
        calledTextPreset: 'please_enter',
        calledTextCustom: null,
        arrivedTextPreset: 'please_wait_here',
        arrivedTextCustom: null,
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
        callAnnouncementReachable: true,
      },
      callCandidates: candidates,
    });

    expect(roomPanelCallCandidates(data)).toEqual(candidates);
    expect(shouldRenderRoomPanelCallSection(data)).toBe(true);
  });
});

describe('roomPanelCallAnnouncementReachable', () => {
  it('defaults to reachable when field is absent (legacy snapshots)', () => {
    const data = snapshot();
    delete (data.capabilities as { callAnnouncementReachable?: boolean }).callAnnouncementReachable;
    expect(roomPanelCallAnnouncementReachable(data)).toBe(true);
  });

  it('reflects server false when WZ-TV is offline', () => {
    expect(
      roomPanelCallAnnouncementReachable(
        snapshot({
          capabilities: {
            requiresPin: true,
            canCheckIn: true,
            canCheckOut: true,
            mayShowPatientNames: false,
            canCall: true,
            callAnnouncementReachable: false,
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('resolveRoomPanelLeadLabel', () => {
  it('uses called text only for enter; arrival and waiting share arrived text', () => {
    expect(
      resolveRoomPanelLeadLabel('enter', {
        called: 'called',
        arrived: 'arrived',
      }),
    ).toBe('called');
    expect(
      resolveRoomPanelLeadLabel('arrival', {
        called: 'called',
        arrived: 'arrived',
      }),
    ).toBe('arrived');
    expect(
      resolveRoomPanelLeadLabel('waiting', {
        called: 'called',
        arrived: 'arrived',
      }),
    ).toBe('arrived');
  });

  it('formats presets via roomPanel i18n keys', () => {
    const panel = snapshot().panel;
    const called = formatRoomPanelDisplayText(
      panel.calledTextPreset,
      panel.calledTextCustom,
      'please_enter',
      t,
    );
    const arrived = formatRoomPanelDisplayText(
      panel.arrivedTextPreset,
      panel.arrivedTextCustom,
      'please_wait_here',
      t,
    );
    expect(resolveRoomPanelLeadLabel('enter', { called, arrived })).toBe(
      'roomPanel.text_please_enter',
    );
    expect(resolveRoomPanelLeadLabel('waiting', { called, arrived })).toBe(
      'roomPanel.text_please_wait_here',
    );
  });
});

describe('roomPanelCandidateDisplayName', () => {
  it('renders ticket-only when names are disabled', () => {
    expect(roomPanelCandidateDisplayName({ identityRef: 'Muster' }, false)).toBeNull();
  });

  it('renders name only when policy allows and identityRef exists', () => {
    expect(roomPanelCandidateDisplayName({ identityRef: '  Muster  ' }, true)).toBe('Muster');
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
