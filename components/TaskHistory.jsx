'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';

// Renders the audit trail for a single task. Events are produced by DB
// triggers (see sql/24_task_events.sql). Collapsed by default to keep the
// task modal compact — most users won't open it on every task.

export default function TaskHistory({ taskId, profiles = {}, tagsById = {} }) {
  const supabase = createClient();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('task_events')
      .select('id, task_id, actor_id, kind, payload, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Realtime: only subscribe while the section is open. New events append.
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`task-events-${taskId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_events', filter: `task_id=eq.${taskId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, taskId, open, load]);

  const fmtTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${date}, ${time}`;
  };

  const actorName = (uid) => profiles[uid]?.display_name || (uid ? 'Пользователь' : 'Система');

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-gray-700 uppercase tracking-wide flex items-center gap-2 hover:text-gray-900"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <History size={12} /> История
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-gray-400">Загрузка…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-400">Событий нет.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 items-start">
                  <Avatar profile={profiles[ev.actor_id] || null} size={20} />
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="text-gray-900">{actorName(ev.actor_id)}</span>{' '}
                    <span className="text-gray-600">{describeEvent(ev, profiles, tagsById)}</span>
                    <span className="text-gray-400 ml-1">· {fmtTime(ev.created_at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function describeEvent(ev, profiles, tagsById) {
  const p = ev.payload || {};
  switch (ev.kind) {
    case 'task_created':
      return 'создал(а) задачу';
    case 'task_updated':
      return describeUpdate(p);
    case 'assignee_added':
      return `назначил(а) ${profiles[p.user_id]?.display_name || 'участника'}`;
    case 'assignee_removed':
      return `снял(а) назначение с ${profiles[p.user_id]?.display_name || 'участника'}`;
    case 'tag_added':
      return `добавил(а) тег «${tagsById[p.tag_id]?.name || '...'}»`;
    case 'tag_removed':
      return `убрал(а) тег «${tagsById[p.tag_id]?.name || '...'}»`;
    default:
      return ev.kind;
  }
}

function describeUpdate(payload) {
  const parts = [];
  for (const [field, value] of Object.entries(payload)) {
    const [oldV, newV] = Array.isArray(value) ? value : [null, value];
    parts.push(describeField(field, oldV, newV));
  }
  return parts.length ? `изменил(а) ${parts.join(', ')}` : 'обновил(а) задачу';
}

function describeField(field, oldV, newV) {
  switch (field) {
    case 'title':       return 'название';
    case 'description': return 'описание';
    case 'important':   return newV ? 'квадрант → важное' : 'квадрант → не важное';
    case 'urgent':      return newV ? 'квадрант → срочное' : 'квадрант → не срочное';
    case 'due_at':
      if (!newV) return 'снял(а) дедлайн';
      if (!oldV) return 'поставил(а) дедлайн';
      return 'дедлайн';
    case 'done':        return newV ? 'отметил(а) выполненной' : 'вернул(а) в активные';
    case 'archived_at': return newV ? 'отправил(а) в архив' : 'вернул(а) из архива';
    default:            return field;
  }
}
