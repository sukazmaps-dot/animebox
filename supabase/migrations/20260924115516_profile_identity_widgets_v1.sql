create table if not exists public.profile_favorite_anime (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  anime_id bigint not null
    references public.anime_catalog(id)
    on delete cascade,
  position smallint not null default 0
    check (position between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

create index if not exists profile_favorite_anime_user_position_idx
  on public.profile_favorite_anime (user_id, position);

alter table public.profile_favorite_anime enable row level security;

revoke all on table public.profile_favorite_anime from anon, authenticated;
grant select, insert, update, delete
  on table public.profile_favorite_anime
  to authenticated;
grant select, insert, update, delete
  on table public.profile_favorite_anime
  to service_role;

drop policy if exists profile_favorite_anime_select_own
  on public.profile_favorite_anime;
create policy profile_favorite_anime_select_own
  on public.profile_favorite_anime
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profile_favorite_anime_insert_own
  on public.profile_favorite_anime;
create policy profile_favorite_anime_insert_own
  on public.profile_favorite_anime
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profile_favorite_anime_update_own
  on public.profile_favorite_anime;
create policy profile_favorite_anime_update_own
  on public.profile_favorite_anime
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists profile_favorite_anime_delete_own
  on public.profile_favorite_anime;
create policy profile_favorite_anime_delete_own
  on public.profile_favorite_anime
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.profile_widgets (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  widget_key text not null
    check (widget_key in ('favorites', 'watching', 'ratings', 'genres', 'activity')),
  position smallint not null default 0
    check (position between 0 and 20),
  visible boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, widget_key)
);

create index if not exists profile_widgets_user_position_idx
  on public.profile_widgets (user_id, position);

alter table public.profile_widgets enable row level security;

revoke all on table public.profile_widgets from anon, authenticated;
grant select, insert, update, delete
  on table public.profile_widgets
  to authenticated;
grant select, insert, update, delete
  on table public.profile_widgets
  to service_role;

drop policy if exists profile_widgets_select_own
  on public.profile_widgets;
create policy profile_widgets_select_own
  on public.profile_widgets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profile_widgets_insert_own
  on public.profile_widgets;
create policy profile_widgets_insert_own
  on public.profile_widgets
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profile_widgets_update_own
  on public.profile_widgets;
create policy profile_widgets_update_own
  on public.profile_widgets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists profile_widgets_delete_own
  on public.profile_widgets;
create policy profile_widgets_delete_own
  on public.profile_widgets
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.profile_favorite_anime is
  'User-selected favorite anime displayed on the profile identity showcase.';

comment on table public.profile_widgets is
  'Per-user profile widget order and visibility settings.';
