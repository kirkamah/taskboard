-- File attachments on tasks. The actual bytes live in Supabase Storage; this
-- table is metadata + access control. Per project convention RLS is permissive
-- and the app gates reads/writes (only users who can see the parent task
-- query attachments).
--
-- Storage bucket is private — clients fetch signed URLs from the app rather
-- than relying on guessable paths.

create table public.task_attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  uploader_id uuid references auth.users(id) on delete set null,
  filename    text not null,
  size_bytes  bigint not null,
  mime_type   text,
  storage_path text not null,
  created_at  timestamptz not null default now()
);

create index task_attachments_task_id_idx on public.task_attachments (task_id, created_at desc);

alter table public.task_attachments enable row level security;

create policy "task_attachments_all_authenticated" on public.task_attachments
  for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.task_attachments;

-- Storage bucket. Private (public=false) so signed URLs are required for
-- downloads. File size cap 10 MB to keep storage costs predictable.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)
on conflict (id) do nothing;

-- Storage policies: any authenticated user can upload, read, and delete
-- objects within this bucket. Task-level access control happens in the app
-- (only visible attachments are listed; uploads are tied to a known task_id).
create policy "task_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

create policy "task_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-attachments');

create policy "task_attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-attachments');
