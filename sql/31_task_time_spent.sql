-- Accumulator for Pomodoro focus minutes spent on a task. Updated when the
-- focus phase of a session completes (25 min); manual stops add nothing.

alter table public.tasks
  add column time_spent_minutes integer not null default 0;
