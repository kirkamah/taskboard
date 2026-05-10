-- Outbound webhooks. Each subscription belongs to a single user and fires on
-- every task_events row that is "visible" to that user (their personal task
-- or a task in a room they're a member of).
--
-- The hook payload is the task_events row plus the task's scope. We sign the
-- body with HMAC-SHA256 using the per-subscription `secret`, set in headers
-- as `X-Taskboard-Signature: sha256=<hex>` so receivers can verify origin.
--
-- Delivery is best-effort fire-and-forget via pg_net.http_post — pg_net
-- handles retries/timeouts at the queue level. last_status_code / last_*
-- fields are populated by an ASYNC trigger reading net._http_response, but
-- v1 leaves that observability for later — receivers can self-log.

create table public.webhook_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  url         text not null,
  secret      text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  last_delivered_at timestamptz
);

create index webhook_subscriptions_owner_idx on public.webhook_subscriptions (owner_id);

alter table public.webhook_subscriptions enable row level security;

create policy "webhook_subscriptions_all_authenticated" on public.webhook_subscriptions
  for all to authenticated
  using (true) with check (true);

-- Trigger function: dispatch a webhook for each matching subscription when a
-- task_event is inserted. Owner of the webhook must have access to the task
-- (be the personal owner OR a member of the task's room).

create or replace function public.dispatch_task_event_webhooks() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  task_owner uuid;
  task_room  uuid;
  member_ids uuid[];
  sub        record;
  body_obj   jsonb;
  body_text  text;
  sig        text;
begin
  select owner_id, room_id into task_owner, task_room
  from public.tasks
  where id = NEW.task_id;

  if task_room is not null then
    select array_agg(user_id) into member_ids
    from public.room_members
    where room_id = task_room;
  end if;

  body_obj := jsonb_build_object(
    'event_id',   NEW.id,
    'task_id',    NEW.task_id,
    'kind',       NEW.kind,
    'actor_id',   NEW.actor_id,
    'payload',    NEW.payload,
    'created_at', NEW.created_at,
    'scope',      jsonb_build_object('owner_id', task_owner, 'room_id', task_room)
  );
  body_text := body_obj::text;

  for sub in
    select id, owner_id, url, secret
    from public.webhook_subscriptions
    where is_active = true
  loop
    if (task_owner is not null and task_owner = sub.owner_id)
       or (member_ids is not null and sub.owner_id = ANY(member_ids))
    then
      sig := encode(extensions.hmac(body_text, sub.secret, 'sha256'), 'hex');
      perform net.http_post(
        url     := sub.url,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'X-Taskboard-Signature', 'sha256=' || sig,
          'X-Taskboard-Event', NEW.kind,
          'X-Taskboard-Subscription', sub.id::text
        ),
        body    := body_obj
      );
      update public.webhook_subscriptions
         set last_delivered_at = now()
       where id = sub.id;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists task_events_dispatch_webhooks on public.task_events;
create trigger task_events_dispatch_webhooks
  after insert on public.task_events
  for each row execute function public.dispatch_task_event_webhooks();
