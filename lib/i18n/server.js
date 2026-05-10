import { cookies } from 'next/headers';
import { normalizeLocale, translate } from '@/lib/i18n';

const COOKIE_NAME = 'tb_locale';

// Read the user-preferred locale on the server. Logged-in users get their
// profile.locale (passed in here); unauthenticated visits read a cookie.
// Defaults to 'ru'.
export async function readLocale({ profileLocale } = {}) {
  if (profileLocale) return normalizeLocale(profileLocale);
  try {
    const cookieStore = await cookies();
    const v = cookieStore.get(COOKIE_NAME)?.value;
    return normalizeLocale(v);
  } catch { return 'ru'; }
}

export function tFor(locale) {
  return (key, params) => translate(locale, key, params);
}

export const LOCALE_COOKIE = COOKIE_NAME;
