-- AnimeBox Patch 18.5.5.2
-- Scale Readiness: additive FK covering indexes only.
-- Based on live Supabase Performance Advisor findings.

create index if not exists comment_reports_reporter_id_idx
  on public.comment_reports (reporter_id);

create index if not exists comment_reports_resolved_by_idx
  on public.comment_reports (resolved_by);

create index if not exists profile_favorite_anime_anime_id_idx
  on public.profile_favorite_anime (anime_id);
