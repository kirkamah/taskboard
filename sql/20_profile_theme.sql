-- Per-user theme preference. Stored here (instead of localStorage-only) so
-- the choice follows the account across devices. The server reads it when
-- rendering /profile so the picker shows the current value; the Navbar-mounted
-- ThemeBootstrap component applies the value at runtime via data-theme on
-- <html>. A tiny inline script in app/layout.jsx reads localStorage before
-- hydration to avoid a light→dark flash on cold loads.

alter table public.profiles
  add column if not exists theme text not null default 'light';

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('light', 'dark', 'cosmic', 'parchment'));
