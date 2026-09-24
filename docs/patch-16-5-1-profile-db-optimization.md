# Patch 16.5.1 — Profile DB Optimization

## Goal

Reduce Supabase round-trips introduced by Profile Identity & Widgets without changing the UI or user-facing behavior.

## Before

Loading the profile widget showcase required:

- one request for widget layout;
- one request for favorite anime;
- one request for ratings;
- one request for library state;
- one additional request for matching `anime_catalog` rows.

Saving profile identity required two browser API calls:

1. save widget layout;
2. save favorite anime.

Each action then rebuilt the full widget bundle again. Favorite validation could also issue one `anime_catalog` lookup per selected title.

## After

### Read path

`getProfileWidgetsData()` calls one server-only RPC:

`profile_identity_bundle(user_id)`

The function returns the complete compact profile payload:

- normalized widget layout;
- up to 6 favorites;
- up to 6 watching titles;
- top 6 user ratings;
- exact rating average/count;
- weighted Anime DNA;
- 6 latest profile activity entries.

The RPC is executable only by `service_role`. Public browser clients never get direct execute permission.

### Write path

The profile editor sends one API request with:

- widget layout;
- favorite anime IDs.

The server batch-validates/hydrates catalog records and then calls:

`save_my_profile_identity(layout, anime_ids)`

The function is `SECURITY INVOKER`, uses `auth.uid()`, and writes through the existing own-row RLS policies.

Layout and favorites are saved in one PostgreSQL transaction. Partial profile saves are no longer possible.

### Catalog hydration

A new `ensureAnimes(ids)` path replaces one-by-one catalog checks.

For up to six selected favorites:

- one batch `anime_catalog` read;
- only missing/stale titles call external metadata;
- missing/stale catalog rows are written with one batch upsert.

The existing single-title `ensureAnime(id)` API remains compatible and now reuses the batch implementation.

## Expected Supabase round-trip reduction

Typical profile read:

- before: about 5 Data API round-trips;
- after: 1 RPC round-trip.

Typical profile save when catalog rows are fresh:

- before: two browser writes, repeated bundle reads, layout/favorite mutations, and per-title catalog checks;
- after: one browser request, one batch catalog validation read, one transactional save RPC, one bundle RPC.

The optimization reduces network chatter while keeping PostgreSQL work set-oriented.

## Security

- `profile_identity_bundle(uuid)`: `SECURITY INVOKER`, execute only for `service_role`.
- `save_my_profile_identity(jsonb, bigint[])`: `SECURITY INVOKER`, execute for `authenticated` and `service_role`.
- save RPC rejects unauthenticated calls through `auth.uid()`.
- existing RLS remains authoritative for `profile_widgets` and `profile_favorite_anime`.
- no `SECURITY DEFINER` bypass is introduced.

## UI impact

None. Patch 16.5.1 is an infrastructure/latency patch only.
