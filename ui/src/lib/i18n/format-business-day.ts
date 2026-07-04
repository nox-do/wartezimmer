import { t } from '$lib/i18n/i18nStore.svelte';
import type { TranslationKey } from '$lib/i18n/core/translation-keys';

/** ISO business day `YYYY-MM-DD` → locale-aware long date (e.g. „4. Juni 2026“). */
export function formatBusinessDayLong(isoDay: string, locale = 'de-DE'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) {
    return isoDay;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

/** MFA day-start banner greeting — uses active locale via `t()`. */
export function dayStartGreeting(): string {
  const hour = new Date().getHours();
  let key: TranslationKey;
  if (hour < 12) {
    key = 'mfa.settings.dayGreetingMorning';
  } else if (hour < 18) {
    key = 'mfa.settings.dayGreetingAfternoon';
  } else {
    key = 'mfa.settings.dayGreetingEvening';
  }
  return t(key);
}
