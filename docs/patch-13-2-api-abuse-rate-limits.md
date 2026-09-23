# Patch 13.2 — API Abuse Guard v1

## Goal
Protect AnimeBox's expensive and state-changing API surfaces from request floods without changing normal UX.

## Architecture
- Shared atomic counters use `api_rate_buckets` and `consume_api_rate_bucket`.
- Keys are HMAC-SHA256 hashes: raw IP addresses and user IDs are not stored.
- Anonymous/public endpoints use IP buckets.
- Authenticated mutations use both IP and user buckets.
- Limiter failure is fail-closed with HTTP 503.
- HTTP 429 includes `Retry-After` and no-store caching.
- Old buckets are cleaned by the existing lifecycle cron.

## Acceptance
1. Normal browsing and editing remain usable.
2. Abuse produces 429.
3. Missing limiter infrastructure produces 503, not a silent bypass.
4. Existing DB anti-spam remains as defense in depth.
5. No raw client IP is persisted.
