'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LOCALES } from '@/lib/i18n';
import { LOCALE_COOKIE } from '@/lib/i18n/server';

// Updates profile.locale for authenticated users and mirrors the choice into
// a cookie so the next server render picks it up immediately. The cookie is
// also useful for unauthenticated pages (login, signup) so they render in
// the chosen language too.
export async function setLocale(value) {
  if (!LOCALES.includes(value)) return { error: 'invalid locale' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient();
    await admin.from('profiles').update({ locale: value }).eq('id', user.id);
  }
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return { ok: true };
}
