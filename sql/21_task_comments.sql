-- Discussion thread for tasks. Visible to anyone the app authorizes for the
-- parent task: any room member in room scope, owner only in personal scope.
-- Per project convention RLS is permissive and real authorization lives in
-- the app layer (middleware + lib/permissions for the UI, lib/apiAccess for
-- the public API).

create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

create index task_comments_task_id_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy "task_comments_all_authenticated" on public.task_comments
  for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.task_comments;
