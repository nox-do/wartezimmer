import { describe, expect, it } from 'vitest';
import { isValidTimeOfDay, validateTopicTimeWindow } from './time-of-day';

describe('isValidTimeOfDay', () => {
  it('accepts HH:mm between 00:00 and 23:59', () => {
    expect(isValidTimeOfDay('00:00')).toBe(true);
    expect(isValidTimeOfDay('08:30')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
  });

  it('rejects invalid hour, minute, or format', () => {
    expect(isValidTimeOfDay('24:00')).toBe(false);
    expect(isValidTimeOfDay('8:00')).toBe(false);
    expect(isValidTimeOfDay('08:60')).toBe(false);
    expect(isValidTimeOfDay('')).toBe(false);
  });
});

describe('validateTopicTimeWindow', () => {
  it('allows empty window', () => {
    expect(validateTopicTimeWindow(null, null)).toEqual({ ok: true });
    expect(validateTopicTimeWindow('', '')).toEqual({ ok: true });
  });

  it('requires both bounds when one is set', () => {
    expect(validateTopicTimeWindow('08:00', null)).toEqual({ ok: false, code: 'incomplete' });
    expect(validateTopicTimeWindow(null, '17:00')).toEqual({ ok: false, code: 'incomplete' });
  });

  it('rejects invalid bounds', () => {
    expect(validateTopicTimeWindow('24:00', '17:00')).toEqual({
      ok: false,
      code: 'invalid',
      field: 'from',
      value: '24:00',
    });
    expect(validateTopicTimeWindow('08:00', '24:00')).toEqual({
      ok: false,
      code: 'invalid',
      field: 'to',
      value: '24:00',
    });
  });
});
