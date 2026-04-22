-- Extend notify_task_completed trigger to carry an optional completion note
-- (read from a session-local setting) and to notify the room owner in addition
-- to assignees. Add complete_task_with_note RPC so owners/editors can finish a
-- room task and attach a free-form note that the room owner receives.
CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _actor_id uuid;
  _room_name text;
  _room_owner uuid;
  _note text;
begin
  if old.done = false and new.done = true and new.room_id is not null then
    _actor_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
    _note := nullif(current_setting('app.completion_note', true), '');
    select name, owner_id into _room_name, _room_owner from public.rooms where id = new.room_id;

    insert into public.notifications (recipient_id, type, room_id, task_id, actor_id, payload)
    select distinct recipient_id,
           'task_completed',
           new.room_id,
           new.id,
           _actor_id,
           jsonb_build_object(
             'room_name', _room_name,
             'task_title', new.title,
             'completion_note', _note
           )
    from (
      select user_id as recipient_id from public.task_assignees where task_id = new.id
      union
      select _room_owner where _room_owner is not null
    ) _recipients
    where recipient_id <> coalesce(_actor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_task_with_note(_task_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _user_id uuid;
  _task record;
begin
  _user_id := nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
  if _user_id is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select t.id, t.room_id, t.done into _task from public.tasks t where t.id = _task_id;
  if _task.id is null then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;
  if _task.room_id is null then
    raise exception 'Только для задач комнат' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = _task.room_id
      and user_id = _user_id
      and role in ('owner', 'editor')
  ) then
    raise exception 'Нет прав' using errcode = '42501';
  end if;

  if _task.done then
    return;
  end if;

  perform set_config('app.completion_note', coalesce(nullif(trim(_note), ''), ''), true);
  update public.tasks set done = true where id = _task_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_task_with_note(uuid, text) TO authenticated;
