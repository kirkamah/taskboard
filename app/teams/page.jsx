import Link from 'next/link';
import { ArrowLeft, Users, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const userName = profile?.display_name || user.email.split('@')[0];

  // Получаем членства пользователя с данными комнат
  const { data: memberships } = await supabase
    .from('room_members')
    .select('role, rooms(id, code, name)')
    .eq('user_id', user.id);

  const rooms = (memberships || [])
    .filter(m => m.rooms)
    .map(m => ({ ...m.rooms, role: m.role }));

  // Подсчёт участников, задач и непрочитанных уведомлений для каждой комнаты
  const enriched = await Promise.all(rooms.map(async (room) => {
    const [{ count: memberCount }, { count: taskCount }, { count: unreadCount }] = await Promise.all([
      supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
      supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('room_id', room.id).eq('recipient_id', user.id).eq('is_read', false)
    ]);
    return {
      ...room,
      memberCount: memberCount || 0,
      taskCount: taskCount || 0,
      unreadCount: unreadCount || 0,
    };
  }));

  const roleLabel = { owner: 'Владелец', editor: 'Редактор', viewer: 'Наблюдатель' };

  return (
    <>
      <Navbar userName={userName} userId={user.id} />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
          <ArrowLeft size={16} /> На главную
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Мои команды</h1>

        {enriched.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Users size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Вы пока ни в одной комнате</p>
            <p className="text-sm text-gray-400 mt-1">Создайте свою или присоединитесь к чужой</p>
          </div>
        ) : (
          <div className="space-y-2">
            {enriched.map(room => (
              <Link
                key={room.id}
                href={`/room/${room.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-900 transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{room.name}</h3>
                      {room.unreadCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full">
                          <Bell size={10} /> {room.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Код: <span className="font-mono">{room.code}</span> · Участников: {room.memberCount} · Задач: {room.taskCount}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 border border-gray-300 rounded flex-shrink-0">{roleLabel[room.role]}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
