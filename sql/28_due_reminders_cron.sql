-- Schedule the due-reminders Edge Function to run every 5 minutes via pg_cron.
-- THIS FILE IS NOT AUTO-APPLIED. Run it manually in the Supabase SQL editor
-- ONLY after:
--   1. The Edge Function `due-reminders` is deployed.
--   2. The function's secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--      VAPID_SUBJECT) are set in Supabase → Edge Functions → due-reminders
--      → Manage secrets.
--   3. You've replaced <project-ref> and <anon-key> below with your values.
--
-- The anon key (jwt-claim role=anon) is fine here even though the function is
-- privileged — the function uses SERVICE_ROLE_KEY internally; the anon key
-- is only needed to pass Supabase's API gateway.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'due-reminders-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/due-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', '<supabase-anon-key>'
    )
  );
  $$
);

-- To remove later:
--   select cron.unschedule('due-reminders-every-5-minutes');
