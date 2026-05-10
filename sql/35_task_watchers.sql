-- Task watchers. Anyone who can read a task can "subscribe" to it and
-- receive a notification on every update or new comment, even if they
-- aren't an assignee. Per project convention RLS is permissive; the
-- app layer scopes who can read each task.
--
-- Notifications:
--   - On task_events insert (except tag_added/tag_removed — too noisy),
--     we fan out a `task_watch_update` notification to every watcher
--     except the actor.
--   - On task_comments insert, we fan out `task_watch_comment` likewise.
--     This is independent of the @-mention notification, but the mention
--     path skips the actor too, so a self-comment never notifies anyone.

create table public.task_watchers (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_watchers_user_idx on public.task_watchers (user_id);

alter table public.task_watchers enable row level security;

create policy "task_watchers_all_authenticated" on public.task_watchers
  for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.task_watchers;

-- Fanout from task_events ------------------------------------------------------
create or replace function public.tb_fanout_event_to_watchers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _task_title text;
  _task_room  uuid;
begin
  if NEW.kind in ('tag_added', 'tag_removed') then
    return null;
  end if;

  select title, room_id into _task_title, _task_room
    from public.tasks where id = NEW.task_id;

  insert into public.notifications (recipient_id, type, task_id, room_id, actor_id, payload)
  select w.user_id, 'task_watch_update', NEW.task_id, _task_room, NEW.actor_id,
         jsonb_build_object('task_title', _task_title, 'event_kind', NEW.kind, 'event_payload', NEW.payload)
    from public.task_watchers w
   where w.task_id = NEW.task_id
     and w.user_id is distinct from NEW.actor_id;

  return null;
end; $$;

drop trigger if exists tb_fanout_event_to_watchers_trg on public.task_events;
create trigger tb_fanout_event_to_watchers_trg
  after insert on public.task_events
  for each row execute function public.tb_fanout_event_to_watchers();

-- Fanout from task_comments ----------------------------------------------------
create or replace function public.tb_fanout_comment_to_watchers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _task_title text;
  _task_room  uuid;
  _snippet    text;
begin
  select title, room_id into _task_title, _task_room
    from public.tasks where id = NEW.task_id;

  _snippet := left(NEW.body, 200);

  insert into public.notifications (recipient_id, type, task_id, room_id, actor_id, payload)
  select w.user_id, 'task_watch_comment', NEW.task_id, _task_room, NEW.author_id,
         jsonb_build_object('task_title', _task_title, 'snippet', _snippet)
    from public.task_watchers w
   where w.task_id = NEW.task_id
     and w.user_id is distinct from NEW.author_id;

  return null;
end; $$;

drop trigger if exists tb_fanout_comment_to_watchers_trg on public.task_comments;
create trigger tb_fanout_comment_to_watchers_trg
  after insert on public.task_comments
  for each row execute function public.tb_fanout_comment_to_watchers();
