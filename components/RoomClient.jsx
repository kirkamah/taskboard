'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Users, Copy, Eye, Shield, Crown, Trash2, Edit2, UserCheck, X,
  Lock, Unlock, Ban, UserX, MoreVertical, ShieldBan, Inbox, CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import BoardBody from '@/components/BoardBody';
import Avatar from '@/components/Avatar';
import TagsPanel from '@/components/TagsPanel';
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

function formatAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function RoomClient({ room, initialMembers, initialProfiles, userId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [roomName, setRoomName] = useState(room.name);
  const [isPrivate, setIsPrivate] = useState(!!room.is_private);
  const [togglingPrivate, setTogglingPrivate] = useState(false);
  const [members, setMembers] = useState(initialMembers);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showMembers, setShowMembers] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams?.get('tab') === 'requests' ? 'requests' : 'members');
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
  const [tags, setTags] = useState([]);

  const [requests, setRequests] = useState([]); // pending-заявки
  const [bans, setBans] = useState([]);
  const [kickTarget, setKickTarget] = useState(null);   // {user_id, name}
  const [banTarget, setBanTarget] = useState(null);
  const [unbanTarget, setUnbanTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState(null); // user_id

  const myRole = members.find(m => m.user_id === userId)?.role;
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const canManage = myRole === 'owner';
  const canSeeRequests = myRole === 'owner' || myRole === 'editor';

  const getName = (uid) => profiles[uid]?.display_name || 'Пользователь';
  const getProfile = (uid) => profiles[uid] || null;

  const flash = (msg) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(''), 2500);
  };

  // Догружаем профили для uid, которых ещё нет в profiles.
  const hydrateProfiles = useCallback(async (uids) => {
    const missing = Array.from(new Set(uids.filter(u => u && !profiles[u])));
    if (missing.length === 0) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_emoji, avatar_color')
      .in('id', missing);
    if (data?.length) {
      setProfiles(prev => {
        const next = { ...prev };
        data.forEach(p => {
          next[p.id] = {
            display_name: p.display_name,
            avatar_emoji: p.avatar_emoji,
            avatar_color: p.avatar_color,
          };
        });
        return next;
      });
    }
  }, [profiles, supabase]);

  // Realtime: состав участников и сама комната
  useEffect(() => {
    const channel = supabase
      .channel(`members-${room.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            setMembers(prev => prev.some(m => m.user_id === payload.new.user_id) ? prev : [...prev, payload.new]);
            hydrateProfiles([payload.new.user_id]);
          } else if (payload.eventType === 'UPDATE') {
            setMembers(prev => prev.map(m => m.user_id === payload.new.user_id ? payload.new : m));
          } else if (payload.eventType === 'DELETE') {
            setMembers(prev => prev.filter(m => m.user_id !== payload.old.user_id));
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
          if (typeof payload.new?.is_private === 'boolean') setIsPrivate(payload.new.is_private);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id, userId]);

  // Теги
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('room_tags')
        .select('id, name, color, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true });
      if (alive) setTags(data || []);
    };
    load();
    const channel = supabase
      .channel(`tags-${room.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_tags', filter: `room_id=eq.${room.id}` },
        () => load()
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [room.id]);

  // Заявки (видны owner+editor)
  useEffect(() => {
    if (!canSeeRequests) {
      setRequests([]);
      return;
    }
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('room_join_requests')
        .select('id, user_id, status, note, created_at')
        .eq('room_id', room.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!alive) return;
      setRequests(data || []);
      hydrateProfiles((data || []).map(r => r.user_id));
    };
    load();
    const channel = supabase
      .channel(`requests-${room.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_join_requests', filter: `room_id=eq.${room.id}` },
        () => load()
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [room.id, canSeeRequests]);

  // Баны (видны только owner)
  useEffect(() => {
    if (!canManage) {
      setBans([]);
      return;
    }
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('room_bans')
        .select('id, user_id, banned_by, reason, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false });
      if (!alive) return;
      setBans(data || []);
      const uids = (data || []).flatMap(b => [b.user_id, b.banned_by]);
      hydrateProfiles(uids);
    };
    load();
    const channel = supabase
      .channel(`bans-${room.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_bans', filter: `room_id=eq.${room.id}` },
        () => load()
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [room.id, canManage]);

  // Если вкладка стала недоступна (например, owner передал владение) — вернуться на members
  useEffect(() => {
    if (activeTab === 'requests' && !canSeeRequests) setActiveTab('members');
    if (activeTab === 'bans' && !canManage) setActiveTab('members');
  }, [canSeeRequests, canManage, activeTab]);

  const updateRole = async (targetUserId, newRole) => {
    await supabase.from('room_members').update({ role: newRole }).eq('room_id', room.id).eq('user_id', targetUserId);
  };

  const togglePrivate = async () => {
    setTogglingPrivate(true);
    const next = !isPrivate;
    const { error } = await supabase.from('rooms').update({ is_private: next }).eq('id', room.id);
    setTogglingPrivate(false);
    if (error) {
      alert('Не удалось изменить: ' + error.message);
      return;
    }
    setIsPrivate(next);
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
    flash('Владение передано');
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
    router.push('/dashboard');
  };

  const approveRequest = async (requestId) => {
    const { error } = await supabase.rpc('approve_join_request', { _request_id: requestId });
    if (error) { alert('Не удалось принять заявку: ' + error.message); return; }
    flash('Заявка принята');
  };
  const rejectRequest = async (requestId) => {
    const { error } = await supabase.rpc('reject_join_request', { _request_id: requestId });
    if (error) { alert('Не удалось отклонить заявку: ' + error.message); return; }
    flash('Заявка отклонена');
  };

  const confirmKick = async () => {
    if (!kickTarget) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('kick_member', {
      _room_id: room.id,
      _target_user_id: kickTarget.user_id,
    });
    setActionBusy(false);
    if (error) { alert('Не удалось удалить участника: ' + error.message); return; }
    setKickTarget(null);
    flash('Участник удалён');
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('ban_member', {
      _room_id: room.id,
      _target_user_id: banTarget.user_id,
    });
    setActionBusy(false);
    if (error) { alert('Не удалось заблокировать: ' + error.message); return; }
    setBanTarget(null);
    flash('Участник заблокирован');
  };

  const confirmUnban = async () => {
    if (!unbanTarget) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('unban_member', {
      _room_id: room.id,
      _target_user_id: unbanTarget.user_id,
    });
    setActionBusy(false);
    if (error) { alert('Не удалось разблокировать: ' + error.message); return; }
    setUnbanTarget(null);
    flash('Участник разблокирован');
  };

  useEffect(() => {
    if (!memberMenuOpen) return;
    const handler = () => setMemberMenuOpen(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [memberMenuOpen]);

  const pendingCount = requests.length;
  const banCount = bans.length;

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
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            {isPrivate && <Lock size={18} className="text-gray-500" />}
            {roomName}
          </h1>
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
        <div className="flex gap-2 flex-wrap">
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
                onClick={togglePrivate}
                disabled={togglingPrivate}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100 flex items-center gap-2 disabled:opacity-60"
                title={isPrivate ? 'Сделать открытой' : 'Сделать закрытой'}
              >
                {isPrivate ? <Unlock size={16} /> : <Lock size={16} />}
                {isPrivate ? 'Открыть' : 'Закрыть'}
              </button>
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
            {canSeeRequests && pendingCount > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
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
            tags={tags}
          />
        </div>

        {showMembers && (
          <div className="space-y-4">
          {canManage && <TagsPanel roomId={room.id} tags={tags} />}

          {/* Переключатель вкладок */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex border-b border-gray-200 bg-gray-50 text-xs">
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 px-3 py-2 flex items-center justify-center gap-1 ${activeTab === 'members' ? 'bg-white text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Users size={12} /> Участники ({members.length})
              </button>
              {canSeeRequests && (
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`flex-1 px-3 py-2 flex items-center justify-center gap-1 border-l border-gray-200 ${activeTab === 'requests' ? 'bg-white text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Inbox size={12} /> Заявки
                  {pendingCount > 0 && (
                    <span className="ml-1 min-w-[16px] h-[16px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setActiveTab('bans')}
                  className={`flex-1 px-3 py-2 flex items-center justify-center gap-1 border-l border-gray-200 ${activeTab === 'bans' ? 'bg-white text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <ShieldBan size={12} /> Блок-лист{banCount > 0 && ` (${banCount})`}
                </button>
              )}
            </div>

            <div className="p-4">
              {activeTab === 'members' && (
                <div className="space-y-2">
                  {members.map(m => {
                    const isMe = m.user_id === userId;
                    const isOwner = m.role === 'owner';
                    const memberName = getName(m.user_id);
                    const showKickBtn = !isMe && !isOwner && canEdit && (
                      canManage || (myRole === 'editor' && m.role === 'viewer')
                    );
                    const showBanBtn = !isMe && !isOwner && canManage;
                    const showRoleBtn = !isMe && !isOwner && canManage;
                    const hasActions = showKickBtn || showBanBtn || showRoleBtn;

                    return (
                      <div key={m.user_id} className="border border-gray-200 rounded-md p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {memberName} {isMe && <span className="text-xs text-gray-500">(вы)</span>}
                          </span>
                          <div className="flex items-center gap-1">
                            <RoleBadge role={m.role} />
                            {hasActions && (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMemberMenuOpen(memberMenuOpen === m.user_id ? null : m.user_id);
                                  }}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                                  aria-label="Меню"
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {memberMenuOpen === m.user_id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1 text-sm"
                                  >
                                    {showRoleBtn && m.role === 'viewer' && (
                                      <button
                                        onClick={() => { updateRole(m.user_id, 'editor'); setMemberMenuOpen(null); }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
                                      >
                                        <Shield size={12} /> Сделать помощником
                                      </button>
                                    )}
                                    {showRoleBtn && m.role === 'editor' && (
                                      <button
                                        onClick={() => { updateRole(m.user_id, 'viewer'); setMemberMenuOpen(null); }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
                                      >
                                        <Eye size={12} /> Сделать зрителем
                                      </button>
                                    )}
                                    {showKickBtn && (
                                      <button
                                        onClick={() => { setKickTarget({ user_id: m.user_id, name: memberName }); setMemberMenuOpen(null); }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 text-gray-700"
                                      >
                                        <UserX size={12} /> Удалить из комнаты
                                      </button>
                                    )}
                                    {showBanBtn && (
                                      <button
                                        onClick={() => { setBanTarget({ user_id: m.user_id, name: memberName }); setMemberMenuOpen(null); }}
                                        className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
                                      >
                                        <Ban size={12} /> Заблокировать
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'requests' && canSeeRequests && (
                <div className="space-y-2">
                  {requests.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">
                      Заявок нет
                    </p>
                  ) : requests.map(r => (
                    <div key={r.id} className="border border-gray-200 rounded-md p-2">
                      <div className="flex items-center gap-2">
                        <Avatar profile={getProfile(r.user_id)} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {getName(r.user_id)}
                          </p>
                          <p className="text-xs text-gray-500">{formatAgo(r.created_at)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => approveRequest(r.id)}
                          className="flex-1 text-xs px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-800 flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 size={12} /> Принять
                        </button>
                        <button
                          onClick={() => rejectRequest(r.id)}
                          className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 flex items-center justify-center gap-1"
                        >
                          <X size={12} /> Отклонить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'bans' && canManage && (
                <div className="space-y-2">
                  {bans.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">
                      Никто не заблокирован
                    </p>
                  ) : bans.map(b => (
                    <div key={b.id} className="border border-gray-200 rounded-md p-2">
                      <div className="flex items-center gap-2">
                        <Avatar profile={getProfile(b.user_id)} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {getName(b.user_id)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatAgo(b.created_at)} · забанил {getName(b.banned_by)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUnbanTarget({ user_id: b.user_id, name: getName(b.user_id) })}
                        className="mt-2 w-full text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                      >
                        Разблокировать
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                    const selected = transferRecipient === m.user_id;
                    const roleLabel = m.role === 'editor' ? 'Помощник' : m.role === 'viewer' ? 'Зритель' : m.role;
                    return (
                      <button
                        key={m.user_id}
                        onClick={() => setTransferRecipient(m.user_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 border rounded-lg text-left ${selected ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                      >
                        <Avatar profile={getProfile(m.user_id)} size={28} />
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

      {kickTarget && (
        <Modal onClose={() => !actionBusy && setKickTarget(null)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Удалить участника?</h2>
            <button onClick={() => !actionBusy && setKickTarget(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-700">
              Удалить <span className="font-semibold">{kickTarget.name}</span> из комнаты?
              Этот пользователь сможет вернуться по коду, если вы поделитесь им снова.
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setKickTarget(null)}
              disabled={actionBusy}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={confirmKick}
              disabled={actionBusy}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
            >
              {actionBusy ? 'Удаляем...' : 'Подтвердить'}
            </button>
          </div>
        </Modal>
      )}

      {banTarget && (
        <Modal onClose={() => !actionBusy && setBanTarget(null)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
              <Ban size={18} /> Заблокировать участника?
            </h2>
            <button onClick={() => !actionBusy && setBanTarget(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-700">
              Вы собираетесь заблокировать <span className="font-semibold">{banTarget.name}</span>.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              Этот участник не сможет вернуться в комнату, даже если у него есть код.
              Снять блокировку потом можно во вкладке «Блок-лист».
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setBanTarget(null)}
              disabled={actionBusy}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={confirmBan}
              disabled={actionBusy}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
            >
              {actionBusy ? 'Блокируем...' : 'Заблокировать'}
            </button>
          </div>
        </Modal>
      )}

      {unbanTarget && (
        <Modal onClose={() => !actionBusy && setUnbanTarget(null)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Разблокировать участника?</h2>
            <button onClick={() => !actionBusy && setUnbanTarget(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{unbanTarget.name}</span> снова сможет войти по коду
              (или подать заявку, если комната закрытая).
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setUnbanTarget(null)}
              disabled={actionBusy}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={confirmUnban}
              disabled={actionBusy}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
            >
              {actionBusy ? 'Разблокируем...' : 'Разблокировать'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
