-- Stored Web Push subscriptions per user. The Edge Function `due-reminders`
-- iterates this table and posts to each endpoint via the web-push protocol.
-- A single user may have multiple subscriptions (one per browser/device).

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz,
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_all_authenticated" on public.push_subscriptions
  for all to authenticated
  using (true) with check (true);

-- Track which (task, user) pairs we've already notified so the cron doesn't
-- spam on every tick. (task_id, user_id) uniqueness, with the kind of
-- reminder so we can later add multiple lead times (e.g. 1d, 1h).

create table public.push_reminder_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'due_soon',
  sent_at     timestamptz not null default now(),
  unique (task_id, user_id, kind)
);

create index push_reminder_log_sent_at_idx on public.push_reminder_log (sent_at desc);

alter table public.push_reminder_log enable row level security;
create policy "push_reminder_log_all_authenticated" on public.push_reminder_log
  for all to authenticated
  using (true) with check (true);
