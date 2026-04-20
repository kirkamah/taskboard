-- ============================================================
-- Дополнение к схеме: функция для присоединения по коду
-- Нужна, потому что RLS не даёт видеть комнату, если ты не её участник.
-- Эта функция работает с повышенными правами: находит комнату по коду,
-- добавляет текущего пользователя как viewer и возвращает id комнаты.
-- ============================================================

create or replace function public.join_room_by_code(_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _room_id uuid;
begin
  -- Ищем комнату по коду (регистронезависимо)
  select id into _room_id
  from public.rooms
  where code = upper(_code);

  if _room_id is null then
    raise exception 'Комната с таким кодом не найдена' using errcode = 'P0002';
  end if;

  -- Добавляем текущего пользователя как viewer, если ещё не участник
  insert into public.room_members (room_id, user_id, role)
  values (_room_id, auth.uid(), 'viewer')
  on conflict (room_id, user_id) do nothing;

  return _room_id;
end;
$$;

-- Разрешаем вызывать только залогиненным
revoke all on function public.join_room_by_code(text) from public;
grant execute on function public.join_room_by_code(text) to authenticated;
