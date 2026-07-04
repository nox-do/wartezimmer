import type { TerminalLocale } from '$lib/i18n/core/I18nTypes';

export type NameKeyboardLocale = TerminalLocale;

export type TerminalNameKeyboardLayout = {
  locale: NameKeyboardLocale;
  /** BCP 47 tag for `toLocaleUpperCase` / `toLocaleLowerCase` on name input. */
  nameCaseLocale: string;
  topRow: readonly string[];
  rows: readonly (readonly string[])[];
  /** Extra letter key on the top row before backspace (e.g. German ß). */
  topRowTrailingKey?: string;
  spacebarFrom: string;
  spacebarTo: string;
};

const DE_LAYOUT: TerminalNameKeyboardLayout = {
  locale: 'de-DE',
  nameCaseLocale: 'de-DE',
  topRow: ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
  rows: [
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M', '-'],
  ],
  topRowTrailingKey: 'ß',
  spacebarFrom: 'X',
  spacebarTo: 'M',
};

/** QWERTY — same structure as DE, without umlauts/ß; Y/Z in standard English positions. */
const EN_LAYOUT: TerminalNameKeyboardLayout = {
  locale: 'en-GB',
  nameCaseLocale: 'en-GB',
  topRow: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  rows: [
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-'],
  ],
  spacebarFrom: 'X',
  spacebarTo: 'M',
};

/** Turkish Q keyboard layout. */
const TR_LAYOUT: TerminalNameKeyboardLayout = {
  locale: 'tr-TR',
  nameCaseLocale: 'tr-TR',
  topRow: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  rows: [
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', '-'],
  ],
  spacebarFrom: 'C',
  spacebarTo: 'Ö',
};

/** Russian ЙЦУКЕН keyboard layout. */
const RU_LAYOUT: TerminalNameKeyboardLayout = {
  locale: 'ru-RU',
  nameCaseLocale: 'ru-RU',
  topRow: ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
  rows: [
    ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
    ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'Ё', '-'],
  ],
  spacebarFrom: 'С',
  spacebarTo: 'И',
};

/** Ukrainian ЙЦУКЕН keyboard layout. */
const UK_LAYOUT: TerminalNameKeyboardLayout = {
  locale: 'uk-UA',
  nameCaseLocale: 'uk-UA',
  topRow: ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ї'],
  rows: [
    ['Ф', 'І', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Є'],
    ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'Ґ', '-'],
  ],
  spacebarFrom: 'С',
  spacebarTo: 'И',
};

const LAYOUTS: Record<NameKeyboardLocale, TerminalNameKeyboardLayout> = {
  'de-DE': DE_LAYOUT,
  'en-GB': EN_LAYOUT,
  'tr-TR': TR_LAYOUT,
  'ru-RU': RU_LAYOUT,
  'uk-UA': UK_LAYOUT,
};

export function getTerminalNameKeyboardLayout(locale: string): TerminalNameKeyboardLayout {
  if (locale in LAYOUTS) {
    return LAYOUTS[locale as NameKeyboardLocale];
  }
  return DE_LAYOUT;
}

export function getTerminalNameKeyboardMetrics(layout: TerminalNameKeyboardLayout) {
  const bottomRow = layout.rows[layout.rows.length - 1];
  const spacebarFrom = bottomRow.indexOf(layout.spacebarFrom);
  const spacebarTo = bottomRow.indexOf(layout.spacebarTo);
  const topKeyCount = 1 + layout.topRow.length + (layout.topRowTrailingKey ? 1 : 0) + 1;

  return {
    topKeyCount,
    spacebarKeyCount: spacebarTo - spacebarFrom + 1,
    spacebarLeadingGhostCount: spacebarFrom,
    spacebarTrailingGhostCount: bottomRow.length - spacebarTo - 1,
  };
}
