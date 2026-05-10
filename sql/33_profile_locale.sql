-- User-preferred UI locale. Defaults to ru since the project shipped in
-- Russian; clients fall back to ru when locale is null/unrecognized.

alter table public.profiles
  add column locale text not null default 'ru'
  check (locale in ('ru', 'en'));
