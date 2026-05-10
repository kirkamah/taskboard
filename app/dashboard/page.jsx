import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import DashboardClient from '@/components/DashboardClient';
import { readLocale } from '@/lib/i18n/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color, locale')
    .eq('id', user.id)
    .single();

  const userName = profile?.display_name || user.email.split('@')[0];
  const locale = await readLocale({ profileLocale: profile?.locale });

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} locale={locale} />
      <DashboardClient userName={userName} locale={locale} />
    </>
  );
}
