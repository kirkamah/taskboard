import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import ProfileClient from '@/components/ProfileClient';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .single();

  const safeProfile = profile || { display_name: user.email.split('@')[0], avatar_emoji: null, avatar_color: 'gray' };
  const userName = safeProfile.display_name || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={safeProfile} />
      <ProfileClient userId={user.id} initialProfile={safeProfile} />
    </>
  );
}
