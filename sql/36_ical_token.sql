-- Per-user secret token that authorizes an iCal feed. The feed lives at an
-- unauthenticated route, so the token is the only proof of access — clients
-- like Google Calendar / Apple Calendar don't carry our auth cookies.
--
-- The route handler looks up the profile by token (with the service role,
-- bypassing RLS) and renders an iCal stream of the user's visible tasks
-- with due dates.
--
-- Rotating the token instantly invalidates the existing calendar
-- subscription, so users have to re-paste the URL.

alter table public.profiles
  add column ical_token text unique;

create index profiles_ical_token_idx on public.profiles (ical_token) where ical_token is not null;
