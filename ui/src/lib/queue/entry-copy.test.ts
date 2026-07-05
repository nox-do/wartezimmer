import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/i18n/i18nStore.svelte', () => ({
  t: (key: string) => key,
  tf: (key: string, params: Record<string, string>) =>
    params.topic ? `${params.topic} · ${params.time ?? ''}` : key,
}));

import { queueEntryPrimary, queueEntrySecondary } from './entry-copy';
import type { QueueItem } from './types';

function baseItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    visitId: '20260614-A-001',
    laneCode: 'A',
    number: 1,
    topicId: 'blut',
    topicLabel: 'Blutabnahme',
    status: 'waiting',
    roomId: null,
    roomLabel: null,
    arrivedAt: '2026-06-14T10:00:00.000Z',
    waitMs: 0,
    documentCount: 0,
    checkinPhone: null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    hasMobilePhone: true,
    identityRef: 'Max Mustermann',
    returnUntil: null,
    needsAssistance: false,
    ...overrides,
  };
}

describe('queueEntryPrimary', () => {
  it('shows patient name and topic when identityRef is set', () => {
    expect(queueEntryPrimary(baseItem())).toBe('Max Mustermann · Blutabnahme');
  });

  it('falls back to topic when identityRef is missing', () => {
    expect(queueEntryPrimary(baseItem({ identityRef: null }))).toBe('Blutabnahme');
  });

  it('shows topic for called tickets without a name', () => {
    expect(
      queueEntryPrimary(
        baseItem({
          status: 'called',
          roomId: 'neuer-raum',
          roomLabel: 'Neuer Raum',
          identityRef: null,
        }),
      ),
    ).toBe('Blutabnahme');
  });

  it('shows recall copy for absent_return_later', () => {
    expect(
      queueEntryPrimary(
        baseItem({
          status: 'absent_return_later',
          identityRef: null,
        }),
      ),
    ).toContain('Blutabnahme');
  });
});

describe('queueEntrySecondary', () => {
  it('shows check-in time in the waiting zone', () => {
    expect(queueEntrySecondary(baseItem(), 'waiting')).toBe('mfa.entryCheckedInAt');
  });

  it('shows called status without room in the active zone', () => {
    expect(
      queueEntrySecondary(
        baseItem({
          status: 'called',
          roomId: 'radiologie',
          roomLabel: 'Radiologie',
        }),
        'active',
      ),
    ).toBe('mfa.entryCalled');
  });

  it('shows arrived status without room in the active zone', () => {
    expect(
      queueEntrySecondary(
        baseItem({
          status: 'in_room',
          roomId: 'radiologie',
          roomLabel: 'Radiologie',
        }),
        'active',
      ),
    ).toBe('mfa.entryArrived');
  });

  it('shows neutral recall copy when SMS was not sent', () => {
    const secondary = queueEntrySecondary(
      baseItem({
        status: 'absent_return_later',
        recallNotifySent: false,
      }),
      'away',
    );
    expect(secondary).toContain('mfa.entryAbsentRecallWindow');
  });

  it('shows sent recall copy only when recallNotifySent is true', () => {
    const secondary = queueEntrySecondary(
      baseItem({
        status: 'absent_return_later',
        recallNotifySent: true,
      }),
      'away',
    );
    expect(secondary).toContain('mfa.entryAbsentRecallSent');
  });
});
