// Supabase Edge Function: due-reminders
//
// Invoked on a schedule (pg_cron via pg_net). Looks for tasks whose due_at
// falls inside the next hour and pushes a Web Push notification to each
// (owner | assignee) that hasn't already received one for that task.
//
// Required secrets (Supabase → Edge Functions → due-reminders → Manage
// secrets):
//   VAPID_PUBLIC_KEY   — same value as NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY  — never exposed to clients
//   VAPID_SUBJECT      — "mailto:admin@example.com" or your contact URL
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

Deno.serve(async (_req) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: 'VAPID secrets not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const cutoff = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, title, owner_id, room_id, due_at, done, archived_at, task_assignees(user_id)')
    .gte('due_at', now.toISOString())
    .lt('due_at', cutoff.toISOString())
    .eq('done', false)
    .is('archived_at', null);

  if (tasksErr) {
    return new Response(JSON.stringify({ error: tasksErr.message }), { status: 500 });
  }
  if (!tasks || tasks.length === 0) {
    return new Response(JSON.stringify({ scanned: 0 }), { headers: { 'content-type': 'application/json' } });
  }

  // Each (task, user) is a notification target. Personal owner OR room assignees.
  const targets: { task: any; userId: string }[] = [];
  for (const t of tasks) {
    if (t.owner_id) targets.push({ task: t, userId: t.owner_id });
    for (const a of (t.task_assignees || [])) targets.push({ task: t, userId: a.user_id });
  }
  if (targets.length === 0) {
    return new Response(JSON.stringify({ scanned: tasks.length, sent: 0 }), { headers: { 'content-type': 'application/json' } });
  }

  // Skip already-sent.
  const taskIds = [...new Set(targets.map(x => x.task.id))];
  const { data: log } = await supabase
    .from('push_reminder_log')
    .select('task_id, user_id')
    .in('task_id', taskIds)
    .eq('kind', 'due_soon');
  const sentSet = new Set((log || []).map((r: any) => `${r.task_id}:${r.user_id}`));
  const fresh = targets.filter(x => !sentSet.has(`${x.task.id}:${x.userId}`));

  let sent = 0;
  for (const { task, userId } of fresh) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) {
      // Still log so we don't try again next tick.
      await supabase.from('push_reminder_log').upsert({
        task_id: task.id,
        user_id: userId,
        kind: 'due_soon',
      }, { onConflict: 'task_id,user_id,kind' });
      continue;
    }

    const minutesLeft = Math.max(0, Math.round((new Date(task.due_at).getTime() - Date.now()) / 60000));
    const payload = JSON.stringify({
      title: 'Скоро дедлайн',
      body: `${task.title} · через ${minutesLeft} мин`,
      tag: `task-${task.id}`,
      data: { url: task.room_id ? `/room/${task.room_id}` : '/my-board' },
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        }, payload);
        sent++;
      } catch (e: any) {
        const status = e?.statusCode;
        if (status === 410 || status === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }
    await supabase.from('push_reminder_log').upsert({
      task_id: task.id,
      user_id: userId,
      kind: 'due_soon',
    }, { onConflict: 'task_id,user_id,kind' });
  }

  return new Response(JSON.stringify({ scanned: tasks.length, fresh: fresh.length, sent }), {
    headers: { 'content-type': 'application/json' },
  });
});
