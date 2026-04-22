import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import DashboardClient from '@/components/DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .single();

  const userName = profile?.display_name || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} />
      <DashboardClient userName={userName} />
    </>
  );
}
