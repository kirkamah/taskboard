-- Seed default roles when a new room is created.
--
-- Without this, every room that wasn't caught by the phase-1 backfill lands
-- with zero rows in room_roles, which cascades into failures everywhere
-- that expects a default role:
--   * approve_join_request raises 'В комнате нет роли по умолчанию'
--   * join_room_by_code raises the same when adding a member
--   * assign_member_role has no role to point role_id at
--   * the Settings → Роли UI shows an empty role list

create or replace function public.handle_new_room()
returns trigger
language plpgsql security definer
set search_path to public
as $func$
declare
  v_helper_perms jsonb := jsonb_build_object(
    'create_tasks', true,
    'edit_any_task', true,
    'delete_any_task', true,
    'assign_members', true,
    'manage_tags', true,
    'manage_checklists', true,
    'approve_completion_requests', true,
    'manage_join_requests', true,
    'kick_members', true,
    'manage_room_settings', true
  );
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.room_roles (room_id, name, color, permissions, is_default, position)
  values (new.id, 'Помощник', '#6366f1', v_helper_perms, false, 0);

  insert into public.room_roles (room_id, name, color, permissions, is_default, position)
  values (new.id, 'Зритель', '#9ca3af', '{}'::jsonb, true, 1);

  return new;
end;
$func$;
