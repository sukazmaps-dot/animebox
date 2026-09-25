-- Patch 18.5.5.5 — least-privilege hardening for seo_anime_index.
-- Existing projects may have inherited broader service_role default grants.

revoke all on table public.seo_anime_index from service_role;

grant select, insert, update, delete
  on table public.seo_anime_index
  to service_role;
