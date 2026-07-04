import { describe, expect, it } from 'vitest';
import {
  getTerminalNameKeyboardLayout,
  getTerminalNameKeyboardMetrics,
} from './terminal-name-keyboard-layout';

describe('getTerminalNameKeyboardLayout', () => {
  it('returns German QWERTZ by default for unknown locales', () => {
    expect(getTerminalNameKeyboardLayout('fr-FR').topRow.join('')).toBe('QWERTZUIOPÜ');
  });

  it('uses QWERTY for English with Y before U and Z on the bottom row', () => {
    const layout = getTerminalNameKeyboardLayout('en-GB');
    expect(layout.topRow.join('')).toBe('QWERTYUIOP');
    expect(layout.rows.at(-1)?.[0]).toBe('Z');
    expect(layout.topRowTrailingKey).toBeUndefined();
  });

  it('uses Turkish Q with Ğ Ü Ş İ Ö Ç', () => {
    const layout = getTerminalNameKeyboardLayout('tr-TR');
    expect(layout.topRow.join('')).toBe('QWERTYUIOPĞÜ');
    expect(layout.rows.flat()).toEqual(expect.arrayContaining(['Ş', 'İ', 'Ö', 'Ç']));
  });

  it('uses Russian ЙЦУКЕН for ru-RU', () => {
    const layout = getTerminalNameKeyboardLayout('ru-RU');
    expect(layout.topRow[0]).toBe('Й');
    expect(layout.rows.flat()).toContain('Ё');
  });
});

describe('getTerminalNameKeyboardMetrics', () => {
  it('sizes German spacebar from X through M', () => {
    const metrics = getTerminalNameKeyboardMetrics(getTerminalNameKeyboardLayout('de-DE'));
    expect(metrics.topKeyCount).toBe(14);
    expect(metrics.spacebarKeyCount).toBe(6);
    expect(metrics.spacebarLeadingGhostCount).toBe(1);
    expect(metrics.spacebarTrailingGhostCount).toBe(1);
  });

  it('sizes Turkish top row without a trailing ß key', () => {
    const metrics = getTerminalNameKeyboardMetrics(getTerminalNameKeyboardLayout('tr-TR'));
    expect(metrics.topKeyCount).toBe(14);
  });

  it('offsets Turkish spacebar one key right for symmetry (C … Ö)', () => {
    const metrics = getTerminalNameKeyboardMetrics(getTerminalNameKeyboardLayout('tr-TR'));
    expect(metrics.spacebarKeyCount).toBe(6);
    expect(metrics.spacebarLeadingGhostCount).toBe(2);
    expect(metrics.spacebarTrailingGhostCount).toBe(2);
  });
});
