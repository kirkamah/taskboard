'use client';

import { useState, useEffect, useCallback } from 'react';
import { ListTree, Plus, Maximize2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Renders direct children of a parent task. Lives inside the parent's detail
// modal. Each subtask is a real task and can be opened (calls onOpen) — the
// modal will then re-render for that subtask.
//
// New subtasks inherit owner_id/room_id from the parent (so the tasks_check
// scope constraint stays satisfied) and the parent's important/urgent flags
// (so they default to the same quadrant if ever surfaced separately).

export default function SubtasksList({ parent, userId, onOpen, canEdit = true }) {
  const supabase = createClient();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, done, due_at, archived_at, parent_task_id')
      .eq('parent_task_id', parent.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    setSubs(data || []);
    setLoading(false);
  }, [supabase, parent.id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Realtime: any change to children triggers reload.
  useEffect(() => {
    const channel = supabase
      .channel(`subtasks-${parent.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `parent_task_id=eq.${parent.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, parent.id, load]);

  const addSubtask = async () => {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    const payload = {
      title,
      important: parent.important,
      urgent: parent.urgent,
      done: false,
      parent_task_id: parent.id,
      ...(parent.room_id ? { room_id: parent.room_id, owner_id: null } : { owner_id: parent.owner_id || userId, room_id: null }),
    };
    await supabase.from('tasks').insert(payload);
    setDraft('');
    setAdding(false);
    await load();
  };

  const toggleDone = async (sub) => {
    await supabase.from('tasks').update({ done: !sub.done }).eq('id', sub.id);
    setSubs((prev) => prev.map((s) => s.id === sub.id ? { ...s, done: !sub.done } : s));
  };

  const total = subs.length;
  const done = subs.filter((s) => s.done).length;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
        <ListTree size={12} /> Подзадачи{total > 0 ? ` · ${done}/${total}` : ''}
      </p>
      {!loading && subs.length > 0 && (
        <div className="space-y-1 mb-2">
          {subs.map((s) => {
            const overdue = s.due_at && !s.done && new Date(s.due_at).getTime() < Date.now();
            return (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => toggleDone(s)}
                  disabled={!canEdit}
                  className="w-4 h-4 flex-shrink-0"
                />
                <span className={`flex-1 text-sm ${s.done ? 'text-gray-400 line-through' : 'text-gray-800'} ${overdue ? 'text-red-700' : ''}`}>
                  {s.title}
                </span>
                <button
                  onClick={() => onOpen?.(s.id)}
                  className="text-gray-300 group-hover:text-gray-500"
                  title="Открыть подзадачу"
                >
                  <Maximize2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
            placeholder="Новая подзадача — Enter, чтобы добавить"
            className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            onClick={addSubtask}
            disabled={!draft.trim() || adding}
            className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus size={12} /> {adding ? '…' : 'Добавить'}
          </button>
        </div>
      )}
    </div>
  );
}
