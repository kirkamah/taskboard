-- Archive for completed tasks. Distinct from `done`: archived tasks are still
-- "completed" but pulled off the visible done list, so users can clear noise
-- without losing history. Restore unsets archived_at; permanent delete is the
-- normal DELETE.

alter table public.tasks add column archived_at timestamptz;

create index tasks_archived_at_idx on public.tasks (archived_at)
  where archived_at is not null;
