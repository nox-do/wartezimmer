import type { AppLocale } from '$lib/i18n/core/I18nTypes';
import { writable } from 'svelte/store';

/** Practice topics are configured in German in MFA settings. */
const SOURCE_LANGUAGE_CANDIDATES = ['de', 'de-DE'] as const;

const LOCALE_TO_TRANSLATOR: Record<AppLocale, string | null> = {
  'de-DE': null,
  'en-GB': 'en',
  'tr-TR': 'tr',
  'ru-RU': 'ru',
  'uk-UA': 'uk',
};

const TARGET_LANGUAGE_CANDIDATES: Record<AppLocale, readonly string[]> = {
  'de-DE': [],
  'en-GB': ['en', 'en-GB'],
  'tr-TR': ['tr', 'tr-TR'],
  'ru-RU': ['ru', 'ru-RU'],
  'uk-UA': ['uk', 'uk-UA'],
};

function getTranslatorApi(): TranslatorConstructor | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  return globalThis.Translator ?? null;
}

export function getTranslatorTargetLanguage(locale: AppLocale): string | null {
  return LOCALE_TO_TRANSLATOR[locale];
}

let cachedTranslatorKey: string | null = null;
let cachedTranslator: TranslatorInstance | null = null;
export const translatorReadyTick = writable(0);
const translationCache = new Map<string, string>();

function cacheKey(source: string, target: string, text: string): string {
  return `${source}|${target}|${text}`;
}

function resetTranslator(): void {
  cachedTranslator?.destroy();
  cachedTranslator = null;
  cachedTranslatorKey = null;
}

function languagePairsForLocale(locale: AppLocale): Array<{ source: string; target: string }> {
  const targets = TARGET_LANGUAGE_CANDIDATES[locale];
  const pairs: Array<{ source: string; target: string }> = [];

  for (const source of SOURCE_LANGUAGE_CANDIDATES) {
    for (const target of targets) {
      pairs.push({ source, target });
    }
  }

  return pairs;
}

async function createTranslatorPair(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<TranslatorInstance | null> {
  const api = getTranslatorApi();
  if (!api) {
    return null;
  }

  try {
    const availability = await api.availability({ sourceLanguage, targetLanguage });
    if (availability === 'unavailable') {
      return null;
    }

    return await api.create({
      sourceLanguage,
      targetLanguage,
    });
  } catch {
    return null;
  }
}

async function getTranslatorForLocale(locale: AppLocale): Promise<TranslatorInstance | null> {
  if (!getTranslatorTargetLanguage(locale)) {
    return null;
  }

  for (const pair of languagePairsForLocale(locale)) {
    const key = `${pair.source}->${pair.target}`;
    if (cachedTranslator && cachedTranslatorKey === key) {
      return cachedTranslator;
    }

    resetTranslator();

    const translator = await createTranslatorPair(pair.source, pair.target);
    if (!translator) {
      continue;
    }

    cachedTranslatorKey = key;
    cachedTranslator = translator;
    translatorReadyTick.update((value) => value + 1);
    return translator;
  }

  return null;
}

function activeLanguagePair(): { source: string; target: string } | null {
  if (!cachedTranslatorKey) {
    return null;
  }

  const [source, target] = cachedTranslatorKey.split('->');
  if (!source || !target) {
    return null;
  }

  return { source, target };
}

export async function translateDynamicLabels(
  labels: readonly string[],
  locale: AppLocale,
): Promise<{ labels: Map<string, string>; translatorUsed: boolean }> {
  const result = new Map<string, string>();
  for (const label of labels) {
    result.set(label, label);
  }

  if (!getTranslatorTargetLanguage(locale)) {
    return { labels: result, translatorUsed: false };
  }

  const uniqueLabels = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (uniqueLabels.length === 0) {
    return { labels: result, translatorUsed: false };
  }

  const translator = await getTranslatorForLocale(locale);
  if (!translator) {
    return { labels: result, translatorUsed: false };
  }

  const pair = activeLanguagePair();
  if (!pair) {
    return { labels: result, translatorUsed: false };
  }

  let translatedAny = false;

  for (const label of uniqueLabels) {
    const key = cacheKey(pair.source, pair.target, label);
    const cached = translationCache.get(key);
    if (cached) {
      result.set(label, cached);
      if (cached !== label) {
        translatedAny = true;
      }
      continue;
    }

    try {
      const translated = (await translator.translate(label)).trim();
      const finalLabel = translated || label;
      translationCache.set(key, finalLabel);
      result.set(label, finalLabel);
      if (finalLabel !== label) {
        translatedAny = true;
      }
    } catch {
      result.set(label, label);
    }
  }

  return { labels: result, translatorUsed: translatedAny };
}

export async function translateDynamicLabelsWithRetry(
  labels: readonly string[],
  locale: AppLocale,
  cancelled: () => boolean = () => false,
  maxAttempts = 4,
  delayMs = 1200,
): Promise<Map<string, string>> {
  const fallback = new Map<string, string>();
  for (const label of labels) {
    fallback.set(label, label);
  }

  if (!getTranslatorTargetLanguage(locale)) {
    return fallback;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (cancelled()) {
      return fallback;
    }

    const { labels: map, translatorUsed } = await translateDynamicLabels(labels, locale);
    if (cancelled()) {
      return fallback;
    }

    if (translatorUsed || attempt === maxAttempts - 1) {
      return map;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return fallback;
}

/** Call after explicit user locale choice — loads Chrome translation models in background. */
export async function warmBrowserTranslator(locale: AppLocale): Promise<boolean> {
  const targetLanguage = getTranslatorTargetLanguage(locale);
  if (!targetLanguage) {
    return false;
  }

  const timeoutMs = 15_000;

  try {
    const translator = await Promise.race([
      getTranslatorForLocale(locale),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!translator) {
      return false;
    }

    await Promise.race([
      translator.translate('Anmeldung'),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}
