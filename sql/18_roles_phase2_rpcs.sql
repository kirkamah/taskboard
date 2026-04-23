-- Configurable roles — phase 2: RPC layer.
--
-- Adds role-management RPCs (create/update/delete/set_default/assign) and
-- rewires every existing RPC that used to branch on role ∈ ('owner','editor')
-- to go through public.user_has_permission() instead. owner is still implicit
-- in user_has_permission (short-circuits true before touching role_id), so the
-- owner case stays untouched.
--
-- ban_member / unban_member stay owner-only per spec.
--
-- Frontend still reads role='editor'/'viewer' for UI affordances — phase 3
-- collapses that into role='member' + permission checks on the client.

begin;

-- ---------------------------------------------------------------------------
-- New role-management RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_role(
  p_room_id uuid,
  p_name text,
  p_color text default '#6366f1',
  p_permissions jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _name text;
  _color text;
  _perms jsonb;
  _new_id uuid;
  _max_pos int;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if not public.user_has_permission(_user_id, p_room_id, 'manage_roles') then
    raise exception 'Нет прав для управления ролями' using errcode = '42501';
  end if;

  _name := trim(coalesce(p_name, ''));
  if char_length(_name) < 1 or char_length(_name) > 32 then
    raise exception 'Название роли должно быть от 1 до 32 символов' using errcode = '22023';
  end if;

  _color := coalesce(nullif(trim(p_color), ''), '#6366f1');
  _perms := coalesce(p_permissions, '{}'::jsonb);
  if jsonb_typeof(_perms) <> 'object' then
    raise exception 'permissions должен быть jsonb-объектом' using errcode = '22023';
  end if;

  select coalesce(max(position), -1) + 1 into _max_pos
    from public.room_roles where room_id = p_room_id;

  insert into public.room_roles (room_id, name, color, permissions, is_default, position)
  values (p_room_id, _name, _color, _perms, false, _max_pos)
  returning id into _new_id;

  return _new_id;
end;
$func$;


create or replace function public.update_role(
  p_role_id uuid,
  p_name text default null,
  p_color text default null,
  p_permissions jsonb default null
) returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _room_id uuid;
  _new_name text;
  _new_color text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select room_id into _room_id from public.room_roles where id = p_role_id;
  if _room_id is null then
    raise exception 'Роль не найдена' using errcode = 'P0002';
  end if;

  if not public.user_has_permission(_user_id, _room_id, 'manage_roles') then
    raise exception 'Нет прав для управления ролями' using errcode = '42501';
  end if;

  if p_name is not null then
    _new_name := trim(p_name);
    if char_length(_new_name) < 1 or char_length(_new_name) > 32 then
      raise exception 'Название роли должно быть от 1 до 32 символов' using errcode = '22023';
    end if;
  end if;

  if p_color is not null then
    _new_color := nullif(trim(p_color), '');
  end if;

  if p_permissions is not null and jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'permissions должен быть jsonb-объектом' using errcode = '22023';
  end if;

  update public.room_roles
     set name        = coalesce(_new_name, name),
         color       = coalesce(_new_color, color),
         permissions = coalesce(p_permissions, permissions)
   where id = p_role_id;
end;
$func$;


create or replace function public.delete_role(p_role_id uuid)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _role record;
  _default_id uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select id, room_id, is_default into _role
    from public.room_roles where id = p_role_id;
  if _role.id is null then
    raise exception 'Роль не найдена' using errcode = 'P0002';
  end if;

  if not public.user_has_permission(_user_id, _role.room_id, 'manage_roles') then
    raise exception 'Нет прав для управления ролями' using errcode = '42501';
  end if;

  if _role.is_default then
    raise exception 'Сначала назначьте другую роль по умолчанию' using errcode = '42501';
  end if;

  select id into _default_id
    from public.room_roles
    where room_id = _role.room_id and is_default = true;

  if _default_id is null then
    raise exception 'В комнате нет роли по умолчанию' using errcode = 'P0002';
  end if;

  update public.room_members
     set role_id = _default_id
   where room_id = _role.room_id and role_id = p_role_id;

  delete from public.room_roles where id = p_role_id;
end;
$func$;


create or replace function public.set_default_role(p_role_id uuid)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _room_id uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select room_id into _room_id from public.room_roles where id = p_role_id;
  if _room_id is null then
    raise exception 'Роль не найдена' using errcode = 'P0002';
  end if;

  if not public.user_has_permission(_user_id, _room_id, 'manage_roles') then
    raise exception 'Нет прав для управления ролями' using errcode = '42501';
  end if;

  -- Clear the old default first so the unique partial index on
  -- (room_id) where is_default=true stays satisfied mid-statement.
  update public.room_roles
     set is_default = false
   where room_id = _room_id and is_default = true;

  update public.room_roles
     set is_default = true
   where id = p_role_id;
end;
$func$;


create or replace function public.assign_member_role(
  p_room_id uuid, p_user_id uuid, p_role_id uuid
) returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _target_role text;
  _role_room uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if not public.user_has_permission(_user_id, p_room_id, 'manage_roles') then
    raise exception 'Нет прав для управления ролями' using errcode = '42501';
  end if;

  select role into _target_role
    from public.room_members
    where room_id = p_room_id and user_id = p_user_id;

  if _target_role is null then
    raise exception 'Участник не найден' using errcode = 'P0002';
  end if;

  if _target_role = 'owner' then
    raise exception 'Нельзя менять роль владельца' using errcode = '42501';
  end if;

  select room_id into _role_room from public.room_roles where id = p_role_id;
  if _role_room is null then
    raise exception 'Роль не найдена' using errcode = 'P0002';
  end if;
  if _role_room <> p_room_id then
    raise exception 'Роль принадлежит другой комнате' using errcode = '22023';
  end if;

  update public.room_members
     set role_id = p_role_id
   where room_id = p_room_id and user_id = p_user_id;
end;
$func$;


-- ---------------------------------------------------------------------------
-- Rewired existing RPCs — role-literal checks → user_has_permission
-- ---------------------------------------------------------------------------

create or replace function public.join_room_by_code(_code text)
returns json
language plpgsql security definer
set search_path to public
as $func$
declare
  _room record;
  _user_id uuid;
  _existing_role text;
  _existing_request uuid;
  _requester_name text;
  _new_request_id uuid;
  _default_role_id uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Пользователь не авторизован' using errcode = '28000';
  end if;

  select id, owner_id, name, is_private into _room
    from public.rooms where code = upper(_code);

  if _room.id is null then
    raise exception 'Комната с таким кодом не найдена' using errcode = 'P0002';
  end if;

  if _room.owner_id = _user_id then
    return json_build_object('room_id', _room.id, 'status', 'owner', 'role', 'owner');
  end if;

  if exists (select 1 from public.room_bans where room_id = _room.id and user_id = _user_id) then
    return json_build_object('room_id', _room.id, 'status', 'banned');
  end if;

  select role into _existing_role
    from public.room_members
    where room_id = _room.id and user_id = _user_id;

  if _existing_role is not null then
    return json_build_object('room_id', _room.id, 'status', 'already_member', 'role', _existing_role);
  end if;

  select id into _default_role_id
    from public.room_roles
    where room_id = _room.id and is_default = true;

  if _default_role_id is null then
    raise exception 'В комнате нет роли по умолчанию' using errcode = 'P0002';
  end if;

  if not _room.is_private then
    insert into public.room_members (room_id, user_id, role, role_id)
    values (_room.id, _user_id, 'member', _default_role_id);

    return json_build_object('room_id', _room.id, 'status', 'joined', 'role', 'member');
  end if;

  select id into _existing_request
    from public.room_join_requests
    where room_id = _room.id and user_id = _user_id and status = 'pending';

  if _existing_request is not null then
    return json_build_object('room_id', _room.id, 'status', 'request_exists');
  end if;

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
     and public.user_has_permission(rm.user_id, rm.room_id, 'manage_join_requests');

  return json_build_object('room_id', _room.id, 'status', 'request_created', 'request_id', _new_request_id);
end;
$func$;


create or replace function public.approve_join_request(_request_id uuid)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _req record;
  _default_role_id uuid;
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

  if not public.user_has_permission(_user_id, _req.room_id, 'manage_join_requests') then
    raise exception 'Нет прав для обработки заявки' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.room_bans
    where room_id = _req.room_id and user_id = _req.user_id
  ) then
    raise exception 'Пользователь заблокирован в этой комнате' using errcode = '42501';
  end if;

  select id into _default_role_id
    from public.room_roles
    where room_id = _req.room_id and is_default = true;

  if _default_role_id is null then
    raise exception 'В комнате нет роли по умолчанию' using errcode = 'P0002';
  end if;

  update public.room_join_requests
     set status = 'approved',
         responder_id = _user_id,
         responded_at = now()
   where id = _request_id;

  insert into public.room_members (room_id, user_id, role, role_id)
  values (_req.room_id, _req.user_id, 'member', _default_role_id)
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

  delete from public.notifications
   where request_id = _request_id and type = 'join_request_created';
end;
$func$;


create or replace function public.reject_join_request(_request_id uuid)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _req record;
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

  if not public.user_has_permission(_user_id, _req.room_id, 'manage_join_requests') then
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
   where request_id = _request_id and type = 'join_request_created';
end;
$func$;


create or replace function public.kick_member(_room_id uuid, _target_user_id uuid)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _target_role text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if _user_id = _target_user_id then
    raise exception 'Нельзя удалить самого себя' using errcode = '22023';
  end if;

  if not public.user_has_permission(_user_id, _room_id, 'kick_members') then
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

  delete from public.room_members
   where room_id = _room_id and user_id = _target_user_id;

  update public.room_join_requests
     set status = 'rejected', responder_id = _user_id, responded_at = now()
   where room_id = _room_id
     and user_id = _target_user_id
     and status = 'pending';
end;
$func$;


create or replace function public.create_completion_request(_task_id uuid, _note text default null)
returns uuid
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _task record;
  _request_id uuid;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select t.id, t.title, t.room_id, r.name as room_name
    into _task
    from public.tasks t
    join public.rooms r on r.id = t.room_id
    where t.id = _task_id;

  if _task.id is null then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.task_assignees
    where task_id = _task_id and user_id = _user_id
  ) then
    raise exception 'Вы не назначены на эту задачу' using errcode = '42501';
  end if;

  insert into public.task_completion_requests (task_id, requester_id, request_note, status)
  values (_task_id, _user_id, nullif(trim(_note), ''), 'pending')
  returning id into _request_id;

  insert into public.notifications (recipient_id, type, room_id, task_id, request_id, actor_id, payload)
  select rm.user_id,
         'request_created',
         _task.room_id,
         _task.id,
         _request_id,
         _user_id,
         jsonb_build_object(
           'room_name', _task.room_name,
           'task_title', _task.title,
           'request_note', nullif(trim(_note), '')
         )
    from public.room_members rm
   where rm.room_id = _task.room_id
     and rm.user_id <> _user_id
     and public.user_has_permission(rm.user_id, rm.room_id, 'approve_completion_requests');

  return _request_id;
end;
$func$;


create or replace function public.respond_to_completion_request(
  _request_id uuid, _action text, _note text default null
) returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _request record;
  _task record;
  _new_status text;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  if _action not in ('approve', 'reject') then
    raise exception 'Неизвестное действие' using errcode = '22023';
  end if;

  select * into _request from public.task_completion_requests where id = _request_id;
  if _request.id is null then
    raise exception 'Запрос не найден' using errcode = 'P0002';
  end if;
  if _request.status <> 'pending' then
    raise exception 'Запрос уже обработан' using errcode = '22023';
  end if;

  select t.id, t.title, t.room_id, r.name as room_name
    into _task
    from public.tasks t
    join public.rooms r on r.id = t.room_id
    where t.id = _request.task_id;

  if not public.user_has_permission(_user_id, _task.room_id, 'approve_completion_requests') then
    raise exception 'Нет прав для ответа на запрос' using errcode = '42501';
  end if;

  _new_status := case _action when 'approve' then 'approved' else 'rejected' end;

  update public.task_completion_requests
     set status = _new_status,
         response_note = nullif(trim(_note), ''),
         responder_id = _user_id,
         responded_at = now()
   where id = _request_id;

  if _action = 'approve' then
    update public.tasks set done = true where id = _task.id;
  end if;

  insert into public.notifications (recipient_id, type, room_id, task_id, request_id, actor_id, payload)
  values (
    _request.requester_id,
    case _action when 'approve' then 'request_approved' else 'request_rejected' end,
    _task.room_id,
    _task.id,
    _request_id,
    _user_id,
    jsonb_build_object(
      'room_name', _task.room_name,
      'task_title', _task.title,
      'response_note', nullif(trim(_note), '')
    )
  );

  delete from public.notifications
   where request_id = _request_id and type = 'request_created';
end;
$func$;


create or replace function public.complete_task_with_note(_task_id uuid, _note text default null)
returns void
language plpgsql security definer
set search_path to public
as $func$
declare
  _user_id uuid;
  _task record;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select t.id, t.room_id, t.done into _task
    from public.tasks t where t.id = _task_id;

  if _task.id is null then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;
  if _task.room_id is null then
    raise exception 'Только для задач комнат' using errcode = '42501';
  end if;

  if not public.user_has_permission(_user_id, _task.room_id, 'edit_any_task') then
    raise exception 'Нет прав' using errcode = '42501';
  end if;

  if _task.done then
    return;
  end if;

  perform set_config('app.completion_note', coalesce(nullif(trim(_note), ''), ''), true);
  update public.tasks set done = true where id = _task_id;
end;
$func$;

commit;
