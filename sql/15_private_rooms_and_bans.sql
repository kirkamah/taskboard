-- Закрытые комнаты и блокировка участников.
--
-- Закрытые комнаты: владелец может сделать комнату приватной, и входящие
-- по коду не добавляются сразу, а отправляют заявку. Owner+editor видят
-- заявки и одобряют/отклоняют их.
--
-- Блокировка: кик (удалить из room_members, можно вернуться по коду) —
-- доступно owner+editor; бан (удалить + чёрный список) — только owner.

-- ============================================================
-- 1. Схема
-- ============================================================

alter table public.rooms
  add column if not exists is_private boolean not null default false;

create table if not exists public.room_join_requests (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  note         text,
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  responder_id uuid references auth.users(id)
);

create index if not exists room_join_requests_room_id_idx
  on public.room_join_requests (room_id);
create index if not exists room_join_requests_user_id_idx
  on public.room_join_requests (user_id);

-- Только одна активная заявка от пользователя в одну комнату.
create unique index if not exists room_join_requests_one_pending
  on public.room_join_requests (room_id, user_id)
  where status = 'pending';

create table if not exists public.room_bans (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  banned_by  uuid not null references auth.users(id),
  reason     text,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists room_bans_room_id_idx on public.room_bans (room_id);
create index if not exists room_bans_user_id_idx on public.room_bans (user_id);

-- RLS: permissive project-wide (фильтрация в RPC и клиентских запросах).
alter table public.room_join_requests enable row level security;
alter table public.room_bans enable row level security;

drop policy if exists "room_join_requests_all_authenticated" on public.room_join_requests;
create policy "room_join_requests_all_authenticated"
  on public.room_join_requests
  for all to authenticated
  using (true) with check (true);

drop policy if exists "room_bans_all_authenticated" on public.room_bans;
create policy "room_bans_all_authenticated"
  on public.room_bans
  for all to authenticated
  using (true) with check (true);

-- Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'room_join_requests'
  ) then
    alter publication supabase_realtime add table public.room_join_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'room_bans'
  ) then
    alter publication supabase_realtime add table public.room_bans;
  end if;
end $$;

-- ============================================================
-- 2. join_room_by_code — поддержка бана и приватных комнат
-- ============================================================

create or replace function public.join_room_by_code(_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _room record;
  _user_id uuid;
  _existing_role text;
  _existing_request uuid;
  _requester_name text;
  _new_request_id uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Пользователь не авторизован' using errcode = '28000';
  end if;

  select id, owner_id, name, is_private into _room
  from public.rooms
  where code = upper(_code);

  if _room.id is null then
    raise exception 'Комната с таким кодом не найдена' using errcode = 'P0002';
  end if;

  -- Владелец комнаты
  if _room.owner_id = _user_id then
    return json_build_object(
      'room_id', _room.id,
      'status', 'owner',
      'role', 'owner'
    );
  end if;

  -- Бан: проверяем до существующего членства, чтобы не раскрывать факт участия
  if exists (
    select 1 from public.room_bans
    where room_id = _room.id and user_id = _user_id
  ) then
    return json_build_object(
      'room_id', _room.id,
      'status', 'banned'
    );
  end if;

  -- Уже участник
  select role into _existing_role
  from public.room_members
  where room_id = _room.id and user_id = _user_id;

  if _existing_role is not null then
    return json_build_object(
      'room_id', _room.id,
      'status', 'already_member',
      'role', _existing_role
    );
  end if;

  -- Открытая комната — добавляем сразу
  if not _room.is_private then
    insert into public.room_members (room_id, user_id, role)
    values (_room.id, _user_id, 'viewer');

    return json_build_object(
      'room_id', _room.id,
      'status', 'joined',
      'role', 'viewer'
    );
  end if;

  -- Закрытая: активная заявка?
  select id into _existing_request
  from public.room_join_requests
  where room_id = _room.id and user_id = _user_id and status = 'pending';

  if _existing_request is not null then
    return json_build_object(
      'room_id', _room.id,
      'status', 'request_exists'
    );
  end if;

  -- Создаём заявку и уведомляем owner+editor
  insert into public.room_join_requests (room_id, user_id, status)
  values (_room.id, _user_id, 'pending')
  returning id into _new_request_id;

  select display_name into _requester_name
  from public.profiles where id = _user_id;

  insert into public.notifications
    (recipient_id, type, room_id, request_id, actor_id, payload)
  select rm.user_id,
         'join_request_created',
         _room.id,
         _new_request_id,
         _user_id,
         jsonb_build_object(
           'room_name', _room.name,
           'requester_name', coalesce(_requester_name, 'Пользователь')
         )
  from public.room_members rm
  where rm.room_id = _room.id
    and rm.role in ('owner', 'editor');

  return json_build_object(
    'room_id', _room.id,
    'status', 'request_created',
    'request_id', _new_request_id
  );
end;
$$;

revoke all on function public.join_room_by_code(text) from public;
grant execute on function public.join_room_by_code(text) to authenticated;

-- ============================================================
-- 3. approve/reject заявок
-- ============================================================

create or replace function public.approve_join_request(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _req record;
  _room_name text;
  _caller_role text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select r.*, rm.name as room_name
  into _req
  from public.room_join_requests r
  join public.rooms rm on rm.id = r.room_id
  where r.id = _request_id;

  if _req.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
  if _req.status <> 'pending' then
    raise exception 'Заявка уже обработана' using errcode = '22023';
  end if;

  select role into _caller_role
  from public.room_members
  where room_id = _req.room_id and user_id = _user_id;

  if _caller_role not in ('owner', 'editor') then
    raise exception 'Нет прав для обработки заявки' using errcode = '42501';
  end if;

  -- Если за время ожидания юзера успели забанить — одобрять нельзя
  if exists (
    select 1 from public.room_bans
    where room_id = _req.room_id and user_id = _req.user_id
  ) then
    raise exception 'Пользователь заблокирован в этой комнате' using errcode = '42501';
  end if;

  update public.room_join_requests
  set status = 'approved',
      responder_id = _user_id,
      responded_at = now()
  where id = _request_id;

  insert into public.room_members (room_id, user_id, role)
  values (_req.room_id, _req.user_id, 'viewer')
  on conflict (room_id, user_id) do nothing;

  insert into public.notifications
    (recipient_id, type, room_id, request_id, actor_id, payload)
  values (
    _req.user_id,
    'join_request_approved',
    _req.room_id,
    _req.id,
    _user_id,
    jsonb_build_object('room_name', _req.room_name)
  );

  -- Чтобы колокольчик не мигал у других owner/editor после обработки
  delete from public.notifications
  where request_id = _request_id
    and type = 'join_request_created';
end;
$$;

revoke all on function public.approve_join_request(uuid) from public;
grant execute on function public.approve_join_request(uuid) to authenticated;

create or replace function public.reject_join_request(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _req record;
  _room_name text;
  _caller_role text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select r.*, rm.name as room_name
  into _req
  from public.room_join_requests r
  join public.rooms rm on rm.id = r.room_id
  where r.id = _request_id;

  if _req.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
  if _req.status <> 'pending' then
    raise exception 'Заявка уже обработана' using errcode = '22023';
  end if;

  select role into _caller_role
  from public.room_members
  where room_id = _req.room_id and user_id = _user_id;

  if _caller_role not in ('owner', 'editor') then
    raise exception 'Нет прав для обработки заявки' using errcode = '42501';
  end if;

  update public.room_join_requests
  set status = 'rejected',
      responder_id = _user_id,
      responded_at = now()
  where id = _request_id;

  insert into public.notifications
    (recipient_id, type, room_id, request_id, actor_id, payload)
  values (
    _req.user_id,
    'join_request_rejected',
    _req.room_id,
    _req.id,
    _user_id,
    jsonb_build_object('room_name', _req.room_name)
  );

  delete from public.notifications
  where request_id = _request_id
    and type = 'join_request_created';
end;
$$;

revoke all on function public.reject_join_request(uuid) from public;
grant execute on function public.reject_join_request(uuid) to authenticated;

-- ============================================================
-- 4. kick / ban / unban
-- ============================================================

create or replace function public.kick_member(_room_id uuid, _target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _caller_role text;
  _target_role text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if _user_id = _target_user_id then
    raise exception 'Нельзя удалить самого себя' using errcode = '22023';
  end if;

  select role into _caller_role
  from public.room_members
  where room_id = _room_id and user_id = _user_id;

  if _caller_role not in ('owner', 'editor') then
    raise exception 'Нет прав' using errcode = '42501';
  end if;

  select role into _target_role
  from public.room_members
  where room_id = _room_id and user_id = _target_user_id;

  if _target_role is null then
    raise exception 'Участник не найден' using errcode = 'P0002';
  end if;

  if _target_role = 'owner' then
    raise exception 'Нельзя удалить владельца' using errcode = '42501';
  end if;

  -- Editor может удалять только viewer'ов
  if _caller_role = 'editor' and _target_role <> 'viewer' then
    raise exception 'Помощник может удалять только Зрителей' using errcode = '42501';
  end if;

  delete from public.room_members
  where room_id = _room_id and user_id = _target_user_id;

  -- Отменяем все pending-заявки этого юзера в эту комнату
  update public.room_join_requests
  set status = 'rejected', responder_id = _user_id, responded_at = now()
  where room_id = _room_id
    and user_id = _target_user_id
    and status = 'pending';
end;
$$;

revoke all on function public.kick_member(uuid, uuid) from public;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

create or replace function public.ban_member(
  _room_id uuid,
  _target_user_id uuid,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _target_role text;
  _is_owner boolean;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if _user_id = _target_user_id then
    raise exception 'Нельзя заблокировать самого себя' using errcode = '22023';
  end if;

  select (owner_id = _user_id) into _is_owner
  from public.rooms where id = _room_id;

  if _is_owner is null then
    raise exception 'Комната не найдена' using errcode = 'P0002';
  end if;

  if not _is_owner then
    raise exception 'Только владелец может блокировать участников' using errcode = '42501';
  end if;

  -- Целью может быть как текущий участник, так и просто заявитель
  select role into _target_role
  from public.room_members
  where room_id = _room_id and user_id = _target_user_id;

  if _target_role = 'owner' then
    raise exception 'Нельзя заблокировать владельца' using errcode = '42501';
  end if;

  delete from public.room_members
  where room_id = _room_id and user_id = _target_user_id;

  insert into public.room_bans (room_id, user_id, banned_by, reason)
  values (_room_id, _target_user_id, _user_id, nullif(trim(_reason), ''))
  on conflict (room_id, user_id) do nothing;

  update public.room_join_requests
  set status = 'rejected', responder_id = _user_id, responded_at = now()
  where room_id = _room_id
    and user_id = _target_user_id
    and status = 'pending';
end;
$$;

revoke all on function public.ban_member(uuid, uuid, text) from public;
grant execute on function public.ban_member(uuid, uuid, text) to authenticated;

create or replace function public.unban_member(_room_id uuid, _target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _is_owner boolean;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select (owner_id = _user_id) into _is_owner
  from public.rooms where id = _room_id;

  if _is_owner is null then
    raise exception 'Комната не найдена' using errcode = 'P0002';
  end if;

  if not _is_owner then
    raise exception 'Только владелец может разблокировать' using errcode = '42501';
  end if;

  delete from public.room_bans
  where room_id = _room_id and user_id = _target_user_id;
end;
$$;

revoke all on function public.unban_member(uuid, uuid) from public;
grant execute on function public.unban_member(uuid, uuid) to authenticated;
