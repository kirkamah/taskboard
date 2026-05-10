import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound, ChevronRight, Webhook } from 'lucide-react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import ProfileClient from '@/components/ProfileClient';
import IcalSection from '@/components/IcalSection';
import { readLocale, tFor } from '@/lib/i18n/server';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color, theme, locale, ical_token')
    .eq('id', user.id)
    .single();

  const h = await headers();
  const proto = h.get('x-forwarded-proto') || 'https';
  const host = h.get('host') || '';
  const origin = `${proto}://${host}`;

  const safeProfile = profile || { display_name: user.email.split('@')[0], avatar_emoji: null, avatar_color: 'gray', theme: 'light', locale: 'ru' };
  const userName = safeProfile.display_name || user.email.split('@')[0];
  const locale = await readLocale({ profileLocale: safeProfile.locale });
  const t = tFor(locale);

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={safeProfile} locale={locale} />
      <ProfileClient userId={user.id} initialProfile={safeProfile} initialLocale={locale} />
      <div className="max-w-2xl mx-auto px-6 pb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <IcalSection initialToken={safeProfile.ical_token || ''} origin={origin} locale={locale} />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 pb-10 space-y-3">
        <Link
          href="/profile/api-keys"
          className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-900 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="text-gray-700"><KeyRound size={20} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">{t('profile.apiKeys.title')}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{t('profile.apiKeys.hint')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
          </div>
        </Link>
        <Link
          href="/profile/webhooks"
          className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-900 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="text-gray-700"><Webhook size={20} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">{t('profile.webhooks.title')}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{t('profile.webhooks.hint')}</p>
            </div>
            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
          </div>
        </Link>
      </div>
    </>
  );
}
