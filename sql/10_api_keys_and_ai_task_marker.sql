-- API keys for external integrations (ChatGPT, Claude Desktop, scripts).
-- The full key is shown to the user exactly once; we store only a sha256 hash.
-- The prefix column keeps the first ~14 chars ("tb_live_XXXXXXX") so the user
-- can tell their keys apart in the list without exposing the secret.
create table public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  prefix      text not null,
  key_hash    text not null,
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index api_keys_user_id_idx on public.api_keys (user_id);
create unique index api_keys_key_hash_uniq on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

create policy "api_keys_all_authenticated" on public.api_keys
  for all to authenticated
  using (true) with check (true);

-- Marker linking a task to the API key that created it.
-- NULL = task was created via the UI. Non-NULL = created by an AI/script via the API.
-- ON DELETE SET NULL so that permanently deleting a key doesn't wipe the task.
alter table public.tasks
  add column created_by_api_key_id uuid references public.api_keys(id) on delete set null;

create index tasks_created_by_api_key_idx on public.tasks (created_by_api_key_id)
  where created_by_api_key_id is not null;
