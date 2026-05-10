-- Audit trail for task changes. DB-level so we capture writes from any path
-- (UI, public API, MCP). Triggers run AFTER and write a single row per event.
-- Per project convention RLS is permissive; the app layer scopes reads to
-- tasks the user can already see.

create table public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index task_events_task_id_idx on public.task_events (task_id, created_at desc);

alter table public.task_events enable row level security;

create policy "task_events_all_authenticated" on public.task_events
  for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.task_events;

-- Tasks: create / update -------------------------------------------------------
create or replace function public.log_task_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed jsonb := '{}'::jsonb;
begin
  if (TG_OP = 'INSERT') then
    insert into public.task_events (task_id, actor_id, kind, payload)
      values (NEW.id, auth.uid(), 'task_created', '{}'::jsonb);
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    if NEW.title       is distinct from OLD.title       then changed := changed || jsonb_build_object('title',       jsonb_build_array(OLD.title,       NEW.title));       end if;
    if NEW.description is distinct from OLD.description then changed := changed || jsonb_build_object('description', jsonb_build_array(OLD.description, NEW.description)); end if;
    if NEW.important   is distinct from OLD.important   then changed := changed || jsonb_build_object('important',   jsonb_build_array(OLD.important,   NEW.important));   end if;
    if NEW.urgent      is distinct from OLD.urgent      then changed := changed || jsonb_build_object('urgent',      jsonb_build_array(OLD.urgent,      NEW.urgent));      end if;
    if NEW.due_at      is distinct from OLD.due_at      then changed := changed || jsonb_build_object('due_at',      jsonb_build_array(OLD.due_at,      NEW.due_at));      end if;
    if NEW.done        is distinct from OLD.done        then changed := changed || jsonb_build_object('done',        jsonb_build_array(OLD.done,        NEW.done));        end if;
    if NEW.archived_at is distinct from OLD.archived_at then changed := changed || jsonb_build_object('archived_at', jsonb_build_array(OLD.archived_at, NEW.archived_at)); end if;
    if changed <> '{}'::jsonb then
      insert into public.task_events (task_id, actor_id, kind, payload)
        values (NEW.id, auth.uid(), 'task_updated', changed);
    end if;
    return NEW;
  end if;
  return null;
end; $$;

drop trigger if exists tasks_log_event on public.tasks;
create trigger tasks_log_event after insert or update on public.tasks
  for each row execute function public.log_task_event();

-- Task assignees ---------------------------------------------------------------
create or replace function public.log_task_assignee_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.task_events (task_id, actor_id, kind, payload)
      values (NEW.task_id, auth.uid(), 'assignee_added', jsonb_build_object('user_id', NEW.user_id));
  elsif TG_OP = 'DELETE' then
    insert into public.task_events (task_id, actor_id, kind, payload)
      values (OLD.task_id, auth.uid(), 'assignee_removed', jsonb_build_object('user_id', OLD.user_id));
  end if;
  return null;
end; $$;

drop trigger if exists task_assignees_log_event on public.task_assignees;
create trigger task_assignees_log_event after insert or delete on public.task_assignees
  for each row execute function public.log_task_assignee_event();

-- Task tags --------------------------------------------------------------------
create or replace function public.log_task_tag_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.task_events (task_id, actor_id, kind, payload)
      values (NEW.task_id, auth.uid(), 'tag_added', jsonb_build_object('tag_id', NEW.tag_id));
  elsif TG_OP = 'DELETE' then
    insert into public.task_events (task_id, actor_id, kind, payload)
      values (OLD.task_id, auth.uid(), 'tag_removed', jsonb_build_object('tag_id', OLD.tag_id));
  end if;
  return null;
end; $$;

drop trigger if exists task_tags_log_event on public.task_tags;
create trigger task_tags_log_event after insert or delete on public.task_tags
  for each row execute function public.log_task_tag_event();
