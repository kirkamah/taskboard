'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Edit2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';
import Markdown from './Markdown';
import MentionInput from './MentionInput';
import { extractMentions } from '@/lib/mentions';

// Discussion thread for a single task. Mounted inside the task detail modal.
// Permissions: any reader of the parent task can post; users edit/delete only
// their own comments; canModerate (room owner) can also delete others'.
export default function TaskComments({ taskId, taskTitle = '', userId, profiles = {}, canModerate = false, members = [], roomId = null }) {
  const supabase = createClient();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('task_comments')
      .select('id, task_id, author_id, body, created_at, edited_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Realtime: tasks have separate channels in BoardBody; this one is scoped
  // per-task and only lives while the detail modal is open.
  useEffect(() => {
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, taskId, load]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    const { data: inserted, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: userId, body })
      .select('id')
      .single();
    setSubmitting(false);
    if (!error) {
      // Notify mentioned room members (skip self).
      const mentionedIds = extractMentions(body).filter((id) => id !== userId);
      const memberIds = new Set(members.map((m) => m.user_id));
      const recipients = mentionedIds.filter((id) => memberIds.has(id));
      if (recipients.length > 0) {
        const snippet = body.length > 200 ? body.slice(0, 200) + '…' : body;
        await supabase.from('notifications').insert(recipients.map((rid) => ({
          recipient_id: rid,
          type: 'mention',
          room_id: roomId,
          task_id: taskId,
          actor_id: userId,
          payload: { task_title: taskTitle, snippet, comment_id: inserted?.id },
        })));
      }
      setDraft('');
      await load();
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditingDraft(c.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingDraft('');
  };

  const saveEdit = async () => {
    const body = editingDraft.trim();
    if (!body || !editingId) return;
    await supabase
      .from('task_comments')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', editingId);
    cancelEdit();
    await load();
  };

  const del = async (id) => {
    if (!window.confirm('Удалить комментарий?')) return;
    await supabase.from('task_comments').delete().eq('id', id);
    await load();
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${date}, ${time}`;
  };

  const getName = (uid) => profiles[uid]?.display_name || 'Пользователь';

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
        <MessageSquare size={12} /> Комментарии{comments.length > 0 ? ` · ${comments.length}` : ''}
      </p>
      {loading ? (
        <p className="text-xs text-gray-400">Загрузка…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">Пока никто не комментировал.</p>
      ) : (
        <div className="space-y-3 mb-3">
          {comments.map((c) => {
            const isAuthor = c.author_id === userId;
            const canDelete = isAuthor || canModerate;
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="flex gap-2">
                <Avatar profile={profiles[c.author_id] || null} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-900">{getName(c.author_id)}</span>
                    <span className="text-gray-400">{fmtTime(c.created_at)}</span>
                    {c.edited_at && <span className="text-gray-400 italic">изменено</span>}
                  </div>
                  {isEditing ? (
                    <div className="mt-1">
                      <textarea
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        rows={2}
                        maxLength={4000}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                      <div className="flex gap-2 mt-1">
                        <button onClick={saveEdit} disabled={!editingDraft.trim()} className="text-xs px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">Сохранить</button>
                        <button onClick={cancelEdit} className="text-xs px-2 py-1 text-gray-600 hover:text-gray-900">Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-0.5">
                        <Markdown text={c.body} />
                      </div>
                      {(isAuthor || canDelete) && (
                        <div className="flex gap-3 mt-1 text-xs text-gray-400">
                          {isAuthor && (
                            <button onClick={() => startEdit(c)} className="hover:text-gray-700 inline-flex items-center gap-1">
                              <Edit2 size={11} /> Изменить
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => del(c.id)} className="hover:text-red-600 inline-flex items-center gap-1">
                              <Trash2 size={11} /> Удалить
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <MentionInput
            value={draft}
            onChange={setDraft}
            members={members}
            profiles={profiles}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Написать комментарий… (@ — упомянуть)"
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y"
          />
        </div>
        <button
          onClick={submit}
          disabled={!draft.trim() || submitting}
          className="px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
          title="Отправить (Ctrl+Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
