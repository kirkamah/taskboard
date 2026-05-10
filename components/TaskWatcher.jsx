'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { translate } from '@/lib/i18n';

// Subscribe / unsubscribe button that lives inside the task detail modal.
// Shows watcher count next to the toggle so the user can see who else is
// following the task at a glance.
export default function TaskWatcher({ taskId, userId, locale = 'ru' }) {
  const t = (k, p) => translate(locale, k, p);
  const supabase = createClient();
  const [watching, setWatching] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { count: c } = await supabase
      .from('task_watchers')
      .select('user_id', { count: 'exact', head: true })
      .eq('task_id', taskId);
    setCount(c || 0);
    const { data: mine } = await supabase
      .from('task_watchers')
      .select('user_id')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .maybeSingle();
    setWatching(!!mine);
  }, [supabase, taskId, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`task-watchers-${taskId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_watchers', filter: `task_id=eq.${taskId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, taskId, load]);

  const toggle = async () => {
    setBusy(true);
    if (watching) {
      await supabase.from('task_watchers').delete().eq('task_id', taskId).eq('user_id', userId);
    } else {
      await supabase.from('task_watchers').insert({ task_id: taskId, user_id: userId });
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`text-xs px-2 py-1 border rounded inline-flex items-center gap-1 disabled:opacity-50 ${watching ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
      title={watching ? t('watch.unsubscribeTitle') : t('watch.subscribeTitle')}
    >
      {watching ? <Eye size={11} /> : <EyeOff size={11} />}
      {watching ? t('watch.watching') : t('watch.watch')}
      {count > 0 && <span className={watching ? 'opacity-80' : 'text-gray-500'}>· {count}</span>}
    </button>
  );
}
