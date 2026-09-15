-- AnimeBox comments polish: soft-delete support and ownership-safe deletion.
-- Run this migration after 202609150001_community.sql.
begin;

alter table public.comments
  add column if not exists deleted_at timestamptz;

create or replace function public.delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  affected integer;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.comments
  set
    body = 'Комментарий удалён.',
    is_spoiler = false,
    deleted_at = now()
  where id = p_id
    and user_id = uid
    and deleted_at is null;

  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'NOT_OWNER';
  end if;
end;
$$;

-- Deleted comments do not increase current profile statistics. Already earned
-- achievements remain earned, which is intentional.
create or replace function public.community_metrics(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
 with completed_titles as (
  select a.id,a.genres from public.anime_catalog a
  join public.episodes_history h on h.anime_id=a.id and h.user_id=p_user and h.completed
  where a.finished and a.total_episodes is not null and h.episode_number<=a.total_episodes
  group by a.id having count(*)=a.total_episodes
 )
 select jsonb_build_object(
 'episodes',(select count(*) from public.episodes_history where user_id=p_user and completed),
 'titles',(select count(*) from completed_titles),
 'minutes',(select count(*)*24 from public.episodes_history where user_id=p_user and completed),
 'shonen_titles',(select count(*) from completed_titles where genres && array['Shounen','Shonen','Сёнен','Сенен']),
 'comments',(select count(*) from public.comments where user_id=p_user and deleted_at is null),
 'watching',(select count(*) from public.anime_library where user_id=p_user and status='watching'),
 'planned',(select count(*) from public.anime_library where user_id=p_user and status='planned'),
 'completed',(select count(*) from public.anime_library where user_id=p_user and status='completed'),
 'dropped',(select count(*) from public.anime_library where user_id=p_user and status='dropped'));
$$;

revoke all on function public.delete_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;

commit;
