import { getLocales } from 'expo-localization';

import { en, type TranslationKey, type Translations } from './en';

/** Register languages here. Missing keys fall back to English. */
const languages: Record<string, Translations> = { en };

function deviceLanguage() {
  try { return getLocales()[0]?.languageCode ?? 'en'; } catch { return 'en'; }
}
let dictionary: Translations = languages[deviceLanguage()] ?? en;

/** Tests or a language picker can override the device language. */
export function setLanguage(code: string) { dictionary = languages[code] ?? en; }

export function isTranslationKey(value: string): value is TranslationKey { return value in en; }

/**
 * Translate a key, or pass through plain text unchanged. This lets config copy be
 * either `'onboarding.welcome.title'` or `'Welcome!'`.
 */
export function t(keyOrText: TranslationKey | (string & {}), params: Record<string, string | number> = {}) {
  const template = isTranslationKey(keyOrText) ? dictionary[keyOrText] ?? en[keyOrText] : keyOrText;
  return template.replace(/{{(\w+)}}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export type { TranslationKey };
