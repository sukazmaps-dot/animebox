# Patch 16.3 — Player Source Control & Provider Independence

## Goal

Move AnimeBox away from hard-coded provider order and toward a server-controlled playback platform.

The patch keeps the existing player/fallback UX, but adds a central provider registry that can change behavior without a new deployment.

## Provider registry

Supabase tables:

- `player_provider_settings`
- `player_provider_runtime`

Settings control:

- enabled / disabled;
- priority;
- consecutive failure threshold;
- recovery cooldown;
- internal notes.

Runtime state stores:

- healthy / degraded / unavailable / unknown;
- consecutive failures and successes;
- last provider latency;
- last success / failure;
- cooldown window;
- last technical error.

Both tables are service-role only and have RLS enabled.

## Public source policy

`GET /api/player/source-policy`

For an anime episode it combines:

1. admin provider settings;
2. environment readiness;
3. runtime cooldown;
4. copyright restrictions.

The client receives only the operational policy it needs to load sources.

## Playback enforcement

The same control layer is enforced server-side by:

- Kodik;
- AnimeBox Direct;
- AniLiberty.

Disabling a provider in the admin panel therefore cannot be bypassed by calling its playback endpoint directly.

## Health and anti-flapping

Provider requests report their result back to the runtime registry.

A provider is marked degraded after failures. Once the configured consecutive failure threshold is reached it becomes unavailable and enters cooldown.

After cooldown expires, traffic may probe it again. Successful recovery clears the cooldown and returns the provider toward healthy state.

Content-level "episode not found" responses are not treated as infrastructure failures.

## Admin

`/admin/player-sources`

Owner/admin can:

- enable or disable providers;
- change priority;
- tune failure threshold;
- tune cooldown;
- view runtime health;
- inspect recent Player Health metrics;
- reset health to allow a recheck.

Every configuration change is written to the existing admin audit log.

## Episode availability

The server-side episode availability / SEO path also respects provider operational state. A provider disabled by Source Control no longer continues populating episode grids or SEO availability in the background.

## Compatibility

If the new database schema is temporarily missing or unavailable, the control layer falls back to the previous default order:

1. AnimeBox Direct
2. Kodik
3. AniLiberty

This prevents a partial deploy from taking the player offline.
