-- ============================================================
-- Передача владения комнатой — атомарная RPC-функция.
-- Все три UPDATE и вставка уведомления идут одной транзакцией,
-- чтобы не было промежуточного состояния, если запрос прервётся.
--
-- security definer + проверка auth.uid() = rooms.owner_id гарантирует,
-- что вызвать может только текущий владелец (RLS бы пропустил UPDATE
-- rooms, но не гарантировал бы все три шага атомарно).
-- ============================================================

create or replace function public.transfer_room_ownership(
  _room_id uuid,
  _new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_owner_id uuid;
  _room_name text;
  _is_member boolean;
begin
  select owner_id, name into _current_owner_id, _room_name
  from public.rooms
  where id = _room_id;

  if _current_owner_id is null then
    raise exception 'Комната не найдена' using errcode = 'P0002';
  end if;

  if _current_owner_id <> auth.uid() then
    raise exception 'Только текущий владелец может передать владение' using errcode = '42501';
  end if;

  if _new_owner_id = _current_owner_id then
    raise exception 'Нельзя передать владение самому себе' using errcode = '22023';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = _room_id and user_id = _new_owner_id
  ) into _is_member;

  if not _is_member then
    raise exception 'Новый владелец должен быть участником комнаты' using errcode = '22023';
  end if;

  -- 1) rooms.owner_id
  update public.rooms
  set owner_id = _new_owner_id
  where id = _room_id;

  -- 2) прежний владелец → помощник (editor)
  update public.room_members
  set role = 'editor'
  where room_id = _room_id and user_id = _current_owner_id;

  -- 3) новый владелец → owner
  update public.room_members
  set role = 'owner'
  where room_id = _room_id and user_id = _new_owner_id;

  -- 4) уведомление новому владельцу
  insert into public.notifications (recipient_id, type, room_id, payload)
  values (
    _new_owner_id,
    'ownership_transferred',
    _room_id,
    jsonb_build_object(
      'room_name', _room_name,
      'from_user_id', _current_owner_id
    )
  );
end;
$$;

revoke all on function public.transfer_room_ownership(uuid, uuid) from public;
grant execute on function public.transfer_room_ownership(uuid, uuid) to authenticated;
