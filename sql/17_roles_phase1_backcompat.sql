-- Phase 1 follow-up: back-compat fix for role values.
--
-- Phase 1 (file 16) collapsed editor/viewer members into role='member', but the
-- existing frontend (RoomClient, BoardBody) and lib/apiAccess.js still branch
-- on role === 'editor' | 'viewer'. Until phase 3 rewrites those call sites on
-- top of user_has_permission, keep the legacy role text alongside role_id so
-- both worlds coexist.
--
-- After this migration, for every migrated member:
--   role    in ('editor','viewer') — what the old frontend reads
--   role_id → room_roles row       — what phase-2 RPCs will read
--
-- user_has_permission is unchanged: its owner-vs-everyone-else logic treats
-- any non-owner role string identically and routes permission checks through
-- role_id.

begin;

alter table public.room_members
  drop constraint if exists room_members_role_check;

-- Remap role='member' back to editor/viewer based on which seeded role_id points to.
update public.room_members rm
   set role = case rr.name
                when 'Помощник' then 'editor'
                when 'Зритель'  then 'viewer'
                else rm.role
              end
  from public.room_roles rr
 where rm.role_id = rr.id
   and rm.role = 'member';

-- Relaxed CHECK: owner ⇔ role_id is null; any non-owner role ⇒ role_id present.
alter table public.room_members
  add constraint room_members_role_check
  check (
    (role = 'owner' and role_id is null)
    or (role in ('member','editor','viewer') and role_id is not null)
  );

commit;
