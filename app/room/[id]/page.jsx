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
    .select('user_id, role, role_id, joined_at')
    .eq('room_id', id);

  // Роли комнаты (настраиваемые; owner не представлен отдельной записью)
  const { data: roles } = await supabase
    .from('room_roles')
    .select('id, name, color, permissions, is_default, position')
    .eq('room_id', id)
    .order('position', { ascending: true });

  // Получаем профили участников (имя + аватар)
  const userIds = (members || []).map(m => m.user_id);
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_emoji, avatar_color')
    .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

  const profilesMap = {};
  (profilesData || []).forEach(p => {
    profilesMap[p.id] = {
      display_name: p.display_name,
      avatar_emoji: p.avatar_emoji,
      avatar_color: p.avatar_color,
    };
  });

  // Профиль текущего пользователя для навбара
  const currentProfile = profilesMap[user.id] || null;
  const userName = currentProfile?.display_name || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={currentProfile} />
      <RoomClient
        room={room}
        initialMembers={members || []}
        initialProfiles={profilesMap}
        initialRoles={roles || []}
        userId={user.id}
      />
    </>
  );
}
