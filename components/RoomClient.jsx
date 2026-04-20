'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Copy, Eye, Shield, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import BoardBody from '@/components/BoardBody';

function RoleBadge({ role }) {
  const config = {
    owner: { label: 'Владелец', Icon: Crown, classes: 'bg-gray-900 text-white border-gray-900' },
    editor: { label: 'Редактор', Icon: Shield, classes: 'bg-white text-gray-900 border-gray-400' },
    viewer: { label: 'Наблюдатель', Icon: Eye, classes: 'bg-white text-gray-500 border-gray-300' }
  }[role];
  const { Icon } = config;
  return (
    <span className={`text-xs px-2 py-0.5 border rounded flex items-center gap-1 flex-shrink-0 ${config.classes}`}>
      <Icon size={10} /> {config.label}
    </span>
  );
}

export default function RoomClient({ room, initialMembers, initialProfiles, userId }) {
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState(initialMembers);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showMembers, setShowMembers] = useState(true);
  const [copied, setCopied] = useState(false);

  const myRole = members.find(m => m.user_id === userId)?.role;
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const canManage = myRole === 'owner';

  const getName = (uid) => profiles[uid] || 'Пользователь';

  // Realtime: подписка на изменения состава участников
  useEffect(() => {
    const channel = supabase
      .channel(`members-${room.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            setMembers(prev => prev.some(m => m.user_id === payload.new.user_id) ? prev : [...prev, payload.new]);
            // Подгружаем имя нового участника
            const { data } = await supabase.from('profiles').select('id, display_name').eq('id', payload.new.user_id).single();
            if (data) setProfiles(prev => ({ ...prev, [data.id]: data.display_name }));
          } else if (payload.eventType === 'UPDATE') {
            setMembers(prev => prev.map(m => m.user_id === payload.new.user_id ? payload.new : m));
          } else if (payload.eventType === 'DELETE') {
            setMembers(prev => prev.filter(m => m.user_id !== payload.old.user_id));
            // Если удалили меня — выкинуть на главную
            if (payload.old.user_id === userId) {
              router.push('/dashboard');
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id, userId]);

  const updateRole = async (targetUserId, newRole) => {
    await supabase.from('room_members').update({ role: newRole }).eq('room_id', room.id).eq('user_id', targetUserId);
  };

  const removeMember = async (targetUserId) => {
    await supabase.from('room_members').delete().eq('room_id', room.id).eq('user_id', targetUserId);
  };

  const leaveRoom = async () => {
    if (!confirm('Покинуть комнату?')) return;
    await supabase.from('room_members').delete().eq('room_id', room.id).eq('user_id', userId);
    router.push('/dashboard');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2">
            <ArrowLeft size={16} /> На главную
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{room.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-sm text-gray-500">Код:</span>
            <span className="font-mono text-sm px-2 py-1 bg-gray-100 border border-gray-200 rounded">{room.code}</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(room.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Copy size={12} /> {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {!canManage && (
            <button
              onClick={leaveRoom}
              className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg bg-white hover:bg-red-50"
            >
              Покинуть комнату
            </button>
          )}
          <button
            onClick={() => setShowMembers(!showMembers)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100 flex items-center gap-2"
          >
            <Users size={16} /> {showMembers ? 'Скрыть' : 'Участники'} ({members.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className={showMembers ? 'lg:col-span-3' : 'lg:col-span-4'}>
          <BoardBody scope="room" roomId={room.id} userId={userId} canEdit={canEdit} />
        </div>

        {showMembers && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 h-fit">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users size={16} /> Участники
            </h2>
            <div className="space-y-2">
              {members.map(m => {
                const isMe = m.user_id === userId;
                return (
                  <div key={m.user_id} className="border border-gray-200 rounded-md p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {getName(m.user_id)} {isMe && <span className="text-xs text-gray-500">(вы)</span>}
                      </span>
                      <RoleBadge role={m.role} />
                    </div>
                    {canManage && !isMe && m.role !== 'owner' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.role === 'viewer' && (
                          <button
                            onClick={() => updateRole(m.user_id, 'editor')}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1"
                          >
                            <Shield size={10} /> Редактор
                          </button>
                        )}
                        {m.role === 'editor' && (
                          <button
                            onClick={() => updateRole(m.user_id, 'viewer')}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1"
                          >
                            <Eye size={10} /> Наблюдатель
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(m.user_id)}
                          className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
