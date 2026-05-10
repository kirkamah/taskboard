// Lightweight i18n. Two locales: ru (default), en. Locale is per-user, stored
// on the profile, mirrored in localStorage for pre-hydration so the UI doesn't
// flicker between languages on first paint.
//
// Usage:
//   client component:  const { t, locale, setLocale } = useT();
//   server component:  import { t } from '@/lib/i18n/server'  (uses cookie)
//
// Strings are stored as flat key → string maps in lib/locales/{ru,en}.js.
// Missing keys fall back to the key itself, which makes typos discoverable.

import { ru } from './locales/ru';
import { en } from './locales/en';

export const LOCALES = ['ru', 'en'];
export const LOCALE_LABELS = { ru: 'Русский', en: 'English' };

const STRINGS = { ru, en };

export function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : 'ru';
}

export function translate(locale, key, params) {
  const safe = normalizeLocale(locale);
  const dict = STRINGS[safe] || STRINGS.ru;
  let s = dict[key];
  if (s === undefined) {
    // Fall back to ru if en is missing the key — partial coverage is fine.
    s = STRINGS.ru[key];
  }
  if (s === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
