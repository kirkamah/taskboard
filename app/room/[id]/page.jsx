import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import RoomClient from '@/components/RoomClient';

export default async function RoomPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Получаем комнату (RLS пропустит только если мы участник)
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!room) {
    redirect('/dashboard');
  }

  // Получаем участников
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, role, joined_at')
    .eq('room_id', id);

  // Получаем имена участников
  const userIds = (members || []).map(m => m.user_id);
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

  const profilesMap = {};
  (profilesData || []).forEach(p => { profilesMap[p.id] = p.display_name; });

  // Имя текущего пользователя для навбара
  const userName = profilesMap[user.id] || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} />
      <RoomClient
        room={room}
        initialMembers={members || []}
        initialProfiles={profilesMap}
        userId={user.id}
      />
    </>
  );
}
