-- Update handle_new_user so OAuth signups (Google etc.) get a sensible
-- display_name. Google puts the user's name in `full_name` / `name`, not
-- `display_name`. Existing email-signup behaviour stays the same.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'),    ''),
      nullif(trim(new.raw_user_meta_data->>'name'),         ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1),   ''),
      'Пользователь'
    )
  );
  return new;
end;
$$;
