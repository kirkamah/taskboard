-- Reusable task blueprints. A template is just a saved form payload, not a
-- live task. Per project convention RLS is permissive; the app filters by
-- (owner_id = current user AND room_id IS NULL) for personal templates and
-- (room_id = X) for room templates.
--
-- Tags are stored as a uuid array referencing room_tags. Checklist items
-- live in a sibling table for ordering.

create table public.task_templates (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete cascade,
  name          text not null,
  title         text not null,
  description   text not null default '',
  important     boolean not null default true,
  urgent        boolean not null default true,
  tag_ids       uuid[] not null default '{}'::uuid[],
  created_at    timestamptz not null default now(),
  -- mirror of tasks_check: a template is either personal or room-scoped.
  constraint task_templates_scope_check check (
    (owner_id is not null and room_id is null) or
    (owner_id is null and room_id is not null)
  )
);

create index task_templates_owner_idx on public.task_templates (owner_id) where owner_id is not null;
create index task_templates_room_idx  on public.task_templates (room_id)  where room_id  is not null;

create table public.task_template_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  text        text not null,
  position    integer not null default 0
);

create index task_template_checklist_items_template_idx on public.task_template_checklist_items (template_id, position);

alter table public.task_templates enable row level security;
alter table public.task_template_checklist_items enable row level security;

create policy "task_templates_all_authenticated" on public.task_templates
  for all to authenticated using (true) with check (true);

create policy "task_template_checklist_items_all_authenticated" on public.task_template_checklist_items
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.task_templates;
alter publication supabase_realtime add table public.task_template_checklist_items;
