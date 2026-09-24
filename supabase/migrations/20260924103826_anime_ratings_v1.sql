create table if not exists public.anime_ratings (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  anime_id bigint not null
    references public.anime_catalog(id)
    on delete cascade,
  score smallint not null
    check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

create index if not exists anime_ratings_anime_id_idx
  on public.anime_ratings (anime_id);

alter table public.anime_ratings enable row level security;

revoke all on table public.anime_ratings from anon, authenticated;
grant select, insert, update, delete
  on table public.anime_ratings
  to authenticated;
grant select, insert, update, delete
  on table public.anime_ratings
  to service_role;

drop policy if exists anime_ratings_select_own
  on public.anime_ratings;
create policy anime_ratings_select_own
  on public.anime_ratings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists anime_ratings_insert_own
  on public.anime_ratings;
create policy anime_ratings_insert_own
  on public.anime_ratings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists anime_ratings_update_own
  on public.anime_ratings;
create policy anime_ratings_update_own
  on public.anime_ratings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists anime_ratings_delete_own
  on public.anime_ratings;
create policy anime_ratings_delete_own
  on public.anime_ratings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.anime_rating_summary
with (security_invoker = true)
as
select
  anime_id,
  round(avg(score)::numeric, 2) as average_score,
  count(*)::bigint as rating_count
from public.anime_ratings
group by anime_id;

revoke all on table public.anime_rating_summary from anon, authenticated;
grant select on table public.anime_rating_summary to service_role;

comment on table public.anime_ratings is
  'One 1-10 AnimeBox community rating per user and anime.';

comment on view public.anime_rating_summary is
  'Aggregate community rating exposed only to server-side service role.';
