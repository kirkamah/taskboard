'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Copy, Eye, Shield, Crown, Trash2, Edit2, UserCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import BoardBody from '@/components/BoardBody';
import { Modal } from '@/components/UI';

function RoleBadge({ role }) {
  const config = {
    owner: { label: 'Владелец', Icon: Crown, classes: 'bg-gray-900 text-white border-gray-900' },
    editor: { label: 'Помощник', Icon: Shield, classes: 'bg-white text-gray-900 border-gray-400' },
    viewer: { label: 'Зритель', Icon: Eye, classes: 'bg-white text-gray-500 border-gray-300' }
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

  const [roomName, setRoomName] = useState(room.name);
  const [members, setMembers] = useState(initialMembers);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showMembers, setShowMembers] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState(null);
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');

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
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          if (payload.new?.name) setRoomName(payload.new.name);
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

  const renameRoom = async () => {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === roomName) {
      setShowRenameModal(false);
      return;
    }
    setRenaming(true);
    const { error } = await supabase.from('rooms').update({ name: trimmed }).eq('id', room.id);
    setRenaming(false);
    if (error) {
      alert('Не удалось переименовать комнату: ' + error.message);
      return;
    }
    setRoomName(trimmed);
    setShowRenameModal(false);
  };

  const transferOwnership = async () => {
    if (!transferRecipient || transferConfirmText.trim() !== roomName) return;
    setTransferring(true);
    const { error } = await supabase.rpc('transfer_room_ownership', {
      _room_id: room.id,
      _new_owner_id: transferRecipient
    });
    setTransferring(false);
    if (error) {
      alert('Не удалось передать владение: ' + error.message);
      return;
    }
    setShowTransferModal(false);
    setTransferRecipient(null);
    setTransferConfirmText('');
    setFlashMsg('Владение передано');
    setTimeout(() => setFlashMsg(''), 2500);
  };

  const deleteRoom = async () => {
    if (confirmText.trim() !== roomName) return;
    setDeleting(true);
    const { error } = await supabase.from('rooms').delete().eq('id', room.id);
    if (error) {
      setDeleting(false);
      alert('Не удалось удалить комнату: ' + error.message);
      return;
    }
    // Каскад в БД сам удалит room_members и tasks
    router.push('/dashboard');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {flashMsg && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          {flashMsg}
        </div>
      )}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2">
            <ArrowLeft size={16} /> На главную
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{roomName}</h1>
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
          {canManage && (
            <>
              <button
                onClick={() => { setShowRenameModal(true); setRenameText(roomName); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100 flex items-center gap-2"
              >
                <Edit2 size={16} /> Переименовать
              </button>
              <button
                onClick={() => { setShowTransferModal(true); setTransferRecipient(null); setTransferConfirmText(''); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100 flex items-center gap-2"
              >
                <UserCheck size={16} /> Передать владение
              </button>
              <button
                onClick={() => { setShowDeleteModal(true); setConfirmText(''); }}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg bg-white hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 size={16} /> Удалить комнату
              </button>
            </>
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
          <BoardBody
            scope="room"
            roomId={room.id}
            userId={userId}
            canEdit={canEdit}
            members={members}
            profiles={profiles}
            currentUserRole={myRole}
          />
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
                            <Shield size={10} /> Помощник
                          </button>
                        )}
                        {m.role === 'editor' && (
                          <button
                            onClick={() => updateRole(m.user_id, 'viewer')}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1"
                          >
                            <Eye size={10} /> Зритель
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

      {showDeleteModal && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-red-700">Удалить комнату?</h2>
            <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-700">
              Вы собираетесь навсегда удалить комнату <span className="font-semibold">«{roomName}»</span>.
            </p>
            <p className="text-sm text-gray-700">
              Все задачи в комнате и список участников будут безвозвратно удалены. Личные доски участников не пострадают.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              Это действие нельзя отменить.
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                Для подтверждения введите название комнаты: <span className="font-mono normal-case">{roomName}</span>
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={deleteRoom}
              disabled={confirmText.trim() !== roomName || deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {deleting ? 'Удаляем...' : 'Удалить навсегда'}
            </button>
          </div>
        </Modal>
      )}

      {showRenameModal && (
        <Modal onClose={() => setShowRenameModal(false)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Переименовать комнату</h2>
            <button onClick={() => setShowRenameModal(false)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
              Новое название
            </label>
            <input
              type="text"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameRoom(); }}
              placeholder={roomName}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setShowRenameModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={renameRoom}
              disabled={!renameText.trim() || renameText.trim() === roomName || renaming}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {renaming ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}

      {showTransferModal && (
        <Modal onClose={() => setShowTransferModal(false)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Передать владение комнатой</h2>
            <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                Кому передать
              </label>
              {members.filter(m => m.user_id !== userId).length === 0 ? (
                <p className="text-sm text-gray-500">В комнате нет других участников.</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {members.filter(m => m.user_id !== userId).map((m) => {
                    const name = getName(m.user_id);
                    const initial = (name.trim()[0] || '?').toUpperCase();
                    const selected = transferRecipient === m.user_id;
                    const roleLabel = m.role === 'editor' ? 'Помощник' : m.role === 'viewer' ? 'Зритель' : m.role;
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => setTransferRecipient(m.user_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 border rounded-lg text-left ${selected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${selected ? 'bg-white text-gray-900' : 'bg-gray-200 text-gray-700'}`}>
                          {initial}
                        </div>
                        <span className="text-sm flex-1 truncate">{name}</span>
                        <span className={`text-xs ${selected ? 'text-gray-300' : 'text-gray-500'}`}>{roleLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {transferRecipient && (
              <>
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  После передачи вы станете <span className="font-semibold">Помощником</span> и не сможете управлять комнатой (переименовать, удалять, менять роли).
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                    Для подтверждения введите название комнаты: <span className="font-mono normal-case">{roomName}</span>
                  </label>
                  <input
                    type="text"
                    value={transferConfirmText}
                    onChange={(e) => setTransferConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                    autoFocus
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setShowTransferModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={transferOwnership}
              disabled={!transferRecipient || transferConfirmText.trim() !== roomName || transferring}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {transferring ? 'Передаём...' : 'Передать'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
