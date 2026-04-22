'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import LinkifiedText from './LinkifiedText';

/**
 * Компонент колокольчика уведомлений в шапке.
 *
 * Props:
 *  - userId: id текущего пользователя (для подписки на свои уведомления)
 *
 * Поведение:
 *  - В шапке — иконка колокольчика. Если есть непрочитанные — красная точка с количеством.
 *  - Клик → выпадающая панель со списком уведомлений (компактные карточки).
 *  - В компактной карточке видно: Комната · Задача · время отправки.
 *  - Клик по карточке → раскрывается, показывает текст запроса/ответа и кнопку «Перейти к задаче».
 *  - При раскрытии уведомление помечается прочитанным.
 */
export default function NotificationBell({ userId }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const panelRef = useRef(null);

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

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — свежие уведомления прилетают мгновенно
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

  // Клик вне панели — закрываем
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
        setExpandedId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = items.filter(n => !n.is_read).length;

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setItems((prev) => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleExpand = (id) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      const n = items.find(x => x.id === id);
      if (n && !n.is_read) markRead(id);
    }
  };

  const goToTask = (n) => {
    if (n.room_id) router.push(`/room/${n.room_id}`);
    setOpen(false);
  };

  // Форматирование относительного времени: «5 мин назад», «2 ч назад», «вчера», «3 дн назад»
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
      case 'request_created':
        return { label: 'Запрос на выполнение', Icon: MessageSquare, color: 'text-blue-600' };
      case 'request_approved':
        return { label: 'Запрос одобрен', Icon: Check, color: 'text-green-600' };
      case 'request_rejected':
        return { label: 'Запрос отклонён', Icon: X, color: 'text-red-600' };
      case 'task_completed':
        return { label: 'Задача выполнена', Icon: Check, color: 'text-green-600' };
      default:
        return { label: 'Уведомление', Icon: MessageSquare, color: 'text-gray-600' };
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(!open); if (open) setExpandedId(null); }}
        className="relative text-gray-500 hover:text-gray-900 p-1"
        aria-label="Уведомления"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Уведомления</h3>
            {unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} новых</span>}
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Уведомлений пока нет
              </div>
            ) : (
              items.map((n) => {
                const meta = typeMeta(n.type);
                const expanded = expandedId === n.id;
                const roomName = n.payload?.room_name || 'Комната';
                const taskTitle = n.payload?.task_title || 'Задача';
                const requestNote = n.payload?.request_note;
                const responseNote = n.payload?.response_note;
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
                        <button
                          onClick={() => goToTask(n)}
                          className="w-full px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
                        >
                          Перейти к задаче
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
  );
}
