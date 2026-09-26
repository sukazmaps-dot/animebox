create or replace view public.seo_video_episode_index
with (security_invoker = true)
as
select
  s.anime_id,
  s.episode_number,
  s.slug,
  s.first_available_at,
  s.last_confirmed_at,
  s.thumbnail_url,
  a.title as anime_title,
  t.duration_ms,
  t.video_content_url,
  t.video_player_url,
  t.video_verified_at
from public.seo_episode_index s
join public.episode_timeline_meta t
  on t.anime_id = s.anime_id
 and t.episode_number = s.episode_number
left join public.anime_catalog a
  on a.id = s.anime_id
where s.indexable = true
  and s.thumbnail_url is not null
  and (
    t.video_content_url is not null
    or t.video_player_url is not null
  )
  and t.video_verified_at is not null
  and t.video_verified_at > now() - interval '30 days';

revoke all on public.seo_video_episode_index from anon, authenticated;
grant select on public.seo_video_episode_index to service_role;

comment on view public.seo_video_episode_index is
  'Server-only Video Sitemap projection. Only recently verified playable episodes are exposed.';
