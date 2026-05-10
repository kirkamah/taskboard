-- Recurring tasks. A task may carry a `recurrence` value of 'daily',
-- 'weekly' or 'monthly'. When such a task is marked done, an UPDATE
-- trigger silently reverts done to false and advances due_at by the
-- corresponding interval — so the next instance shows up on the board
-- without the user creating it manually.
--
-- Notes:
--   - Recurrence requires due_at; otherwise we have no anchor to advance
--     from. The trigger no-ops when due_at is null and lets the task
--     complete normally.
--   - We preserve the time-of-day component since due_at is timestamptz.
--   - The trigger short-circuits when the task has children (parent_task_id
--     refs) — recurrence on subtasks is meaningless; only top-level tasks
--     recur in this version.

alter table public.tasks
  add column recurrence text
  check (recurrence in ('daily', 'weekly', 'monthly'));

create or replace function public.tb_advance_recurrence()
returns trigger
language plpgsql
as $$
begin
  if old.done = false
     and new.done = true
     and new.recurrence is not null
     and new.due_at is not null
     and new.parent_task_id is null
  then
    new.done := false;
    if new.recurrence = 'daily' then
      new.due_at := new.due_at + interval '1 day';
    elsif new.recurrence = 'weekly' then
      new.due_at := new.due_at + interval '7 days';
    elsif new.recurrence = 'monthly' then
      new.due_at := new.due_at + interval '1 month';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tb_advance_recurrence_trg on public.tasks;
create trigger tb_advance_recurrence_trg
  before update of done on public.tasks
  for each row execute function public.tb_advance_recurrence();
