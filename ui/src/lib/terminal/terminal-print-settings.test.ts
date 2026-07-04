import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_PRINT_WIDTH_MM,
  isTerminalPrintWidthMm,
  markTicketPrinted,
  readTerminalPrintWidthMm,
  shouldAutoPrintTicket,
  writeTerminalPrintWidthMm,
} from './terminal-print-settings';

describe('terminal print settings', () => {
  it('isTerminalPrintWidthMm accepts 58 and 80 only', () => {
    expect(isTerminalPrintWidthMm(58)).toBe(true);
    expect(isTerminalPrintWidthMm(80)).toBe(true);
    expect(isTerminalPrintWidthMm(72)).toBe(false);
  });

  it('readTerminalPrintWidthMm defaults without storage', () => {
    expect(readTerminalPrintWidthMm()).toBe(DEFAULT_TERMINAL_PRINT_WIDTH_MM);
  });

  it('shouldAutoPrintTicket deduplicates per ticket in session', () => {
    const storage = new Map<string, string>();
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      expect(shouldAutoPrintTicket('ticket-a')).toBe(true);
      markTicketPrinted('ticket-a');
      expect(shouldAutoPrintTicket('ticket-a')).toBe(false);
      expect(shouldAutoPrintTicket('ticket-b')).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: original,
      });
    }
  });

  it('writeTerminalPrintWidthMm round-trips when localStorage exists', () => {
    const storage = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      writeTerminalPrintWidthMm(58);
      expect(readTerminalPrintWidthMm()).toBe(58);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });
});
