import { describe, expect, it } from 'vitest';
import {
  shouldReconcileRequestedUrl,
  snapshotMatchesRequestedUrl,
} from './room-panel-requested-url';

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
