-- Configurable roles — phase 1: schema + data migration.
--
-- Introduces public.room_roles and rewires public.room_members so that
-- permissions for non-owners are driven by a per-room role row. Owners
-- keep role='owner' with role_id=null; every other member becomes
-- role='member' with role_id pointing at a room_roles entry.
--
-- Existing rooms get two seeded roles:
--   * "Помощник" — all 10 permission flags true (matches old 'editor')
--   * "Зритель"  — empty permissions, is_default=true (matches old 'viewer'
--                  and is handed out to newly-approved members in later phases)
--
-- Idempotent where it can be; the data migration only touches rows that
-- still have the legacy role values.

begin;

-- 1. New room_roles table -----------------------------------------------------
create table if not exists public.room_roles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) <= 32),
  color text not null default '#6366f1',
  permissions jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists room_roles_room_id_idx
  on public.room_roles(room_id);

-- At most one default role per room.
create unique index if not exists room_roles_one_default_per_room
  on public.room_roles(room_id) where is_default = true;

alter table public.room_roles enable row level security;
drop policy if exists room_roles_all on public.room_roles;
create policy room_roles_all on public.room_roles for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.room_roles;

-- 2. room_members: add role_id, drop legacy role CHECK so migration can run --
alter table public.room_members
  add column if not exists role_id uuid
    references public.room_roles(id) on delete restrict;

alter table public.room_members
  drop constraint if exists room_members_role_check;

-- 3. Permission helper --------------------------------------------------------
create or replace function public.user_has_permission(
  p_user_id uuid, p_room_id uuid, p_permission text
) returns boolean
language plpgsql security definer
set search_path to public
as $func$
declare
  v_role text;
  v_role_id uuid;
  v_permissions jsonb;
begin
  select role, role_id into v_role, v_role_id
  from public.room_members
  where user_id = p_user_id and room_id = p_room_id;

  if v_role is null then
    return false;
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  select permissions into v_permissions
  from public.room_roles
  where id = v_role_id;

  return coalesce((v_permissions ->> p_permission)::boolean, false);
end;
$func$;

-- 4. Seed two roles per existing room and remap editor/viewer members --------
do $mig$
declare
  r record;
  v_helper_id uuid;
  v_viewer_id uuid;
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
  for r in select id from public.rooms loop
    -- Skip rooms that already have seeded roles (re-run safety).
    if exists (select 1 from public.room_roles where room_id = r.id) then
      continue;
    end if;

    insert into public.room_roles (room_id, name, color, permissions, is_default, position)
    values (r.id, 'Помощник', '#6366f1', v_helper_perms, false, 0)
    returning id into v_helper_id;

    insert into public.room_roles (room_id, name, color, permissions, is_default, position)
    values (r.id, 'Зритель', '#9ca3af', '{}'::jsonb, true, 1)
    returning id into v_viewer_id;

    update public.room_members
      set role = 'member', role_id = v_helper_id
      where room_id = r.id and role = 'editor';

    update public.room_members
      set role = 'member', role_id = v_viewer_id
      where room_id = r.id and role = 'viewer';
  end loop;
end;
$mig$;

-- 5. New CHECK: owner => no role_id, member => role_id present ---------------
alter table public.room_members
  add constraint room_members_role_check
  check (
    (role = 'owner' and role_id is null)
    or (role = 'member' and role_id is not null)
  );

commit;
