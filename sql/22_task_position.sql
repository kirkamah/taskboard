-- Manual ordering within a quadrant. Larger position = closer to the top.
-- Default for new rows is the current epoch, so freshly created tasks land
-- on top (matching the previous "newest first" behaviour). Backfill uses
-- created_at so existing boards keep the order users already see.

alter table public.tasks add column position double precision;

update public.tasks
  set position = extract(epoch from created_at)
  where position is null;

alter table public.tasks alter column position set not null;
alter table public.tasks alter column position set default extract(epoch from clock_timestamp());

-- Composite index helps both the per-board sort and the per-quadrant sort.
create index tasks_position_desc_idx on public.tasks (position desc);
