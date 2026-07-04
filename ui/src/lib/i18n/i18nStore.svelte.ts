import { getBrowserLocale, normalizeLocale, DEFAULT_LOCALE } from '$lib/i18n/core/I18nConfig';
import type { AppLocale } from '$lib/i18n/core/I18nTypes';
import { getCurrentLocale, loadLocale, t as tFn, tf as tfFn } from '$lib/i18n/core/I18nManager';
import type { TranslationKey } from '$lib/i18n/core/translation-keys';
import { derived, writable } from 'svelte/store';

export type I18nStatus = 'boot' | 'loading' | 'ready';

let initialized = false;
let localeVersion = $state(0);

export const locale = writable<AppLocale>(DEFAULT_LOCALE);
export const status = writable<I18nStatus>('boot');
export const ready = derived(status, (value) => value === 'ready');

export async function initI18n(explicitLocale?: AppLocale): Promise<AppLocale> {
  return setLocale(explicitLocale ?? getBrowserLocale());
}

export async function setLocale(nextLocale: AppLocale): Promise<AppLocale> {
  const finalLocale = normalizeLocale(nextLocale);

  if (initialized && getCurrentLocale() === finalLocale) {
    return finalLocale;
  }

  status.set('loading');
  initialized = true;
  await loadLocale(finalLocale);
  locale.set(finalLocale);
  localeVersion++;
  status.set('ready');
  return finalLocale;
}

export function t(key: TranslationKey): string;
export function t(key: string): string;
export function t(key: string): string {
  void localeVersion;
  if (!getCurrentLocale()) {
    return key;
  }
  return tFn(key);
}

export function tf(key: TranslationKey, vars: Record<string, string | number>): string;
export function tf(key: string, vars: Record<string, string | number>): string;
export function tf(key: string, vars: Record<string, string | number>): string {
  void localeVersion;
  if (!getCurrentLocale()) {
    return key;
  }
  return tfFn(key, vars);
}
