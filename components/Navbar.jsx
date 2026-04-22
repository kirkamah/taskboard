'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LogOut, User, ChevronDown, ChevronUp, Bell, MessageSquare, Check, X, Crown, ArrowLeft,
} from 'lucide-react';
import LinkifiedText from './LinkifiedText';
import Avatar from './Avatar';

export default function Navbar({ userName, userId, userProfile }) {
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'notifications'
  const [items, setItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const menuRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems(data || []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const closeMenu = () => { setMenuOpen(false); setView('menu'); setExpandedId(null); };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleExpand = (id) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      const n = items.find((x) => x.id === id);
      if (n && !n.is_read) markRead(id);
    }
  };

  const goToTask = (n) => {
    if (n.room_id) router.push(`/room/${n.room_id}`);
    closeMenu();
  };

  const formatAgo = (iso) => {
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
  };

  const typeMeta = (type) => {
    switch (type) {
      case 'request_created': return { label: 'Запрос на выполнение', Icon: MessageSquare, color: 'text-blue-600' };
      case 'request_approved': return { label: 'Запрос одобрен', Icon: Check, color: 'text-green-600' };
      case 'request_rejected': return { label: 'Запрос отклонён', Icon: X, color: 'text-red-600' };
      case 'task_completed': return { label: 'Задача выполнена', Icon: Check, color: 'text-green-600' };
      case 'ownership_transferred': return { label: 'Передача владения', Icon: Crown, color: 'text-amber-600' };
      default: return { label: 'Уведомление', Icon: MessageSquare, color: 'text-gray-600' };
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const profileForAvatar = userProfile || { display_name: userName, avatar_emoji: null, avatar_color: 'gray' };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <Link href="/dashboard" className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
          <img src="/logo.svg" alt="Taskboard" className="w-10 h-10 flex-shrink-0" />
          <span className="truncate">Taskboard</span>
        </Link>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 text-gray-700"
          >
            <div className="relative">
              <Avatar profile={profileForAvatar} size={24} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-red-500 text-white text-[9px] font-semibold rounded-full flex items-center justify-center border border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-gray-700 hidden sm:inline max-w-[160px] truncate">{userName}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && view === 'menu' && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              <Link
                href="/profile"
                onClick={closeMenu}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <User size={14} /> Профиль
              </Link>
              <button
                onClick={() => setView('notifications')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Bell size={14} />
                <span className="flex-1 text-left">Уведомления</span>
                {unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <LogOut size={14} /> Выйти
              </button>
            </div>
          )}

          {menuOpen && view === 'notifications' && (
            <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                <button
                  onClick={() => { setView('menu'); setExpandedId(null); }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  aria-label="Назад"
                >
                  <ArrowLeft size={16} />
                </button>
                <h3 className="font-semibold text-gray-900 text-sm flex-1">Уведомления</h3>
                {unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} новых</span>}
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">Уведомлений пока нет</div>
                ) : (
                  items.map((n) => {
                    const meta = typeMeta(n.type);
                    const expanded = expandedId === n.id;
                    const isOwnership = n.type === 'ownership_transferred';
                    const roomName = n.payload?.room_name || 'Комната';
                    const taskTitle = isOwnership
                      ? `Вам передали владение комнатой «${roomName}»`
                      : (n.payload?.task_title || 'Задача');
                    const requestNote = n.payload?.request_note;
                    const responseNote = n.payload?.response_note;
                    const completionNote = n.payload?.completion_note;
                    const { Icon } = meta;

                    return (
                      <div
                        key={n.id}
                        className={`border-b border-gray-100 last:border-b-0 ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                      >
                        <button
                          onClick={() => handleExpand(n.id)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 ${meta.color}`}>
                              <Icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-900 truncate">{roomName}</span>
                                {!n.is_read && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />}
                              </div>
                              <p className="text-sm text-gray-700 truncate mt-0.5">{taskTitle}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{formatAgo(n.created_at)}</p>
                            </div>
                            <div className="text-gray-400 mt-0.5">
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-4 pb-3 pt-0 space-y-2">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">{meta.label}</p>
                            {requestNote && (
                              <div className="bg-gray-50 border border-gray-200 rounded-md p-2 text-sm text-gray-700">
                                <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Комментарий</p>
                                <LinkifiedText text={requestNote} />
                              </div>
                            )}
                            {responseNote && (
                              <div className="bg-gray-50 border border-gray-200 rounded-md p-2 text-sm text-gray-700">
                                <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Комментарий</p>
                                <LinkifiedText text={responseNote} />
                              </div>
                            )}
                            {completionNote && (
                              <div className="bg-gray-50 border border-gray-200 rounded-md p-2 text-sm text-gray-700">
                                <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Комментарий</p>
                                <LinkifiedText text={completionNote} />
                              </div>
                            )}
                            <button
                              onClick={() => goToTask(n)}
                              className="w-full px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
                            >
                              {isOwnership ? 'Перейти к комнате' : 'Перейти к задаче'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
