import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import CalendarClient from '@/components/CalendarClient';
import { readLocale, tFor } from '@/lib/i18n/server';

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color, locale')
    .eq('id', user.id)
    .single();

  const userName = profile?.display_name || user.email.split('@')[0];
  const locale = await readLocale({ profileLocale: profile?.locale });
  const t = tFor(locale);

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} locale={locale} />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2">
          <ArrowLeft size={16} /> {t('nav.backToDashboard')}
        </Link>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{t('calendar.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('calendar.subtitle')}</p>
        </div>
        <CalendarClient userId={user.id} locale={locale} />
      </div>
    </>
  );
}
