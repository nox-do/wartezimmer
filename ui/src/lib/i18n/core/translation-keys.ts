import type { AppDict } from './AppDict.js';

type DotPrefix<T extends string, P extends string> = P extends '' ? T : `${P}.${T}`;

type Leaves<T, P extends string = ''> = T extends string
  ? P
  : T extends object
    ? { [K in keyof T & string]: Leaves<T[K], DotPrefix<K, P>> }[keyof T & string]
    : never;

/** Dot-notation key into `AppDict`, e.g. `terminal.langDe`. */
export type TranslationKey = Leaves<AppDict>;
