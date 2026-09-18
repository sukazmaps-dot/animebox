-- AnimeBox Premium Profile Studio v1
create table if not exists public.premium_profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'default'
    check (theme in ('default','violet','midnight','sakura')),
  updated_at timestamptz not null default now()
);

alter table public.premium_profile_settings enable row level security;
