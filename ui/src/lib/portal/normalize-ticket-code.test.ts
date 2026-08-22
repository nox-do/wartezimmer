import { describe, expect, it } from 'vitest';
import { formatTicketCodeInput, normalizeTicketCode } from './normalize-ticket-code';

describe('formatTicketCodeInput', () => {
  it('inserts a dash after the lane letter while typing forward', () => {
    expect(formatTicketCodeInput('a', { appendDashAfterLetter: true })).toBe('A-');
    expect(formatTicketCodeInput('A0', { appendDashAfterLetter: true })).toBe('A-0');
    expect(formatTicketCodeInput('A-04', { appendDashAfterLetter: true })).toBe('A-04');
  });

  it('does not force a dash while deleting', () => {
    expect(formatTicketCodeInput('A', { appendDashAfterLetter: false })).toBe('A');
    expect(formatTicketCodeInput('A-', { appendDashAfterLetter: false })).toBe('A-');
  });

  it('normalizes pasted compact codes', () => {
    expect(formatTicketCodeInput('o042')).toBe('O-042');
    expect(formatTicketCodeInput('A-042')).toBe('A-042');
  });
});

describe('normalizeTicketCode', () => {
  it('accepts dashed and compact codes', () => {
    expect(normalizeTicketCode('A-42')).toBe('A-042');
    expect(normalizeTicketCode('a42')).toBe('A-042');
  });

  it('preserves four-digit sequences', () => {
    expect(normalizeTicketCode('A-1000')).toBe('A-1000');
  });

  it('rejects invalid numbers per domain rules', () => {
    expect(normalizeTicketCode('A-000')).toBeNull();
    expect(normalizeTicketCode('A-0')).toBeNull();
    expect(normalizeTicketCode('A000')).toBeNull();
  });

  it('normalizes leading-zero semantics via parseInt', () => {
    expect(normalizeTicketCode('A-0001')).toBe('A-001');
  });
});
