'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';
import { translate } from '@/lib/i18n';

export default function TaskHistory({ taskId, profiles = {}, tagsById = {}, locale = 'ru' }) {
  const supabase = createClient();
  const t = (k, p) => translate(locale, k, p);
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

  const localeTag = locale === 'en' ? 'en-US' : 'ru-RU';
  const fmtTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    const date = d.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
    return `${date}, ${time}`;
  };

  const fallbackName = locale === 'en' ? 'User' : 'Пользователь';
  const actorName = (uid) => profiles[uid]?.display_name || (uid ? fallbackName : t('history.system'));

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-gray-700 uppercase tracking-wide flex items-center gap-2 hover:text-gray-900"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <History size={12} /> {t('history.heading')}
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-gray-400">{t('common.loading')}</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-400">{t('history.empty')}</p>
          ) : (
            <ol className="space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 items-start">
                  <Avatar profile={profiles[ev.actor_id] || null} size={20} />
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="text-gray-900">{actorName(ev.actor_id)}</span>{' '}
                    <span className="text-gray-600">{describeEvent(ev, profiles, tagsById, t)}</span>
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

function describeEvent(ev, profiles, tagsById, t) {
  const p = ev.payload || {};
  switch (ev.kind) {
    case 'task_created':
      return t('history.event.created');
    case 'task_updated':
      return describeUpdate(p, t);
    case 'assignee_added':
      return t('history.event.assigneeAdded', { who: profiles[p.user_id]?.display_name || t('history.placeholder.member') });
    case 'assignee_removed':
      return t('history.event.assigneeRemoved', { who: profiles[p.user_id]?.display_name || t('history.placeholder.member') });
    case 'tag_added':
      return t('history.event.tagAdded', { tag: tagsById[p.tag_id]?.name || t('history.placeholder.tag') });
    case 'tag_removed':
      return t('history.event.tagRemoved', { tag: tagsById[p.tag_id]?.name || t('history.placeholder.tag') });
    default:
      return ev.kind;
  }
}

function describeUpdate(payload, t) {
  const parts = [];
  for (const [field, value] of Object.entries(payload)) {
    const [oldV, newV] = Array.isArray(value) ? value : [null, value];
    parts.push(describeField(field, oldV, newV, t));
  }
  return parts.length ? t('history.event.changed', { fields: parts.join(', ') }) : t('history.event.updated');
}

function describeField(field, oldV, newV, t) {
  switch (field) {
    case 'title':       return t('history.field.title');
    case 'description': return t('history.field.description');
    case 'important':   return newV ? t('history.field.importantOn') : t('history.field.importantOff');
    case 'urgent':      return newV ? t('history.field.urgentOn') : t('history.field.urgentOff');
    case 'due_at':
      if (!newV) return t('history.field.dueClear');
      if (!oldV) return t('history.field.dueSet');
      return t('history.field.due');
    case 'done':        return newV ? t('history.field.doneOn') : t('history.field.doneOff');
    case 'archived_at': return newV ? t('history.field.archiveOn') : t('history.field.archiveOff');
    default:            return field;
  }
}
