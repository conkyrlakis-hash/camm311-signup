-- CUT menu engineering sign-ups. Written only by the menu-send edge function (service role).
create table if not exists public.cut_menu_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lang text not null check (lang in ('en','gr')),
  consent boolean not null check (consent),
  sent_at timestamptz,
  send_error text
);
alter table public.cut_menu_signups enable row level security;
revoke all on public.cut_menu_signups from anon, authenticated;
select count(*) as rows_now from public.cut_menu_signups;
