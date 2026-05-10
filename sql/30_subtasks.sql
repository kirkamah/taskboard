-- Subtasks: a task can be a child of another task. The hierarchy is one
-- level "logical" — UI shows subtasks only inside the parent's detail view,
-- and never on the main board.
--
-- A subtask must inherit its parent's scope (same owner_id or same room_id).
-- We don't enforce this with a check constraint because validation against
-- another row is awkward in CHECK; the app layer fills the right scope when
-- creating subtasks.

alter table public.tasks
  add column parent_task_id uuid references public.tasks(id) on delete cascade;

create index tasks_parent_task_idx on public.tasks (parent_task_id) where parent_task_id is not null;
