# Hotfix 31.15 — API Stability and Telegram membership recovery

## Incident and scope

Railway production (Europe) intermittently timed out when reaching Supabase (Tokyo).
Requests to `consume_api_rate_bucket` had a hard 1.5 s timeout. Public posters,
public recommendations, optional analytics and Telegram membership confirmation
returned 503 before doing their useful work. The Mini App represented any failure
as "Подписка на канал обязательна", even for subscribed users. The same incident
affected catalogue data reads and page rendering, a separate upstream dependency.

This was **not proven to be a DDoS**. HTTP logs include robot traffic, but
observed Supabase connection timeouts and the 503 guard path are sufficient to
explain the error. Do not disable protection globally or assume a malicious source.

## Requirements and implementation

### 1. Bounded process-local public guard

- `lib/public-api-rate-limit.ts` uses a per-process, per-hashed-IP and per-scope
  budget with 60 s windows, `429` and `Retry-After`; never stores raw IPs.
- At most 4096 buckets exist; expired entries can be pruned on saturation, and
  a full active map refuses new identities rather than evicting active offenders.
- Only trusted Cloudflare origin verification allows `cf-connecting-ip`.
  Otherwise continue using the same forwarded-IP policy as the existing guard.
- The guard requires **no database RPC or credentials** and remains available
  during a Supabase outage. It is per instance, **not globally distributed**;
  maintain Cloudflare WAF/rate limiting in front of Railway for distributed
  attack protection. Do not treat this as a substitute for shared auth limits.
- Applied only to `GET /api/image`, `GET /api/recommendations`,
  `POST /api/analytics/product` (best effort, origin/body caps retained), and
  `POST /api/telegram/subscription-check` (verified `initData` retained).
- All other sensitive operations continue to use the fail-closed Supabase
  `consume_api_rate_bucket` guard. No server actions, RLS, schema or secrets
  are changed. Existing upstream allowlist/redirect/byte-size protections stay.

### 2. Telegram membership UX

- `subscribed: true` enables the app; `subscribed: false` **after a successful
  signed check** shows the subscription prompt.
- Any bad response, unavailable server, expired Telegram launch data or
  malformed membership result enters `unavailable`: separate title and
  explanatory message, plus "Повторить проверку". No false assertion that
  the user unsubscribed.
- All `checking`, `blocked`, and `unavailable` states keep the underlying
  Mini App inert until successful verification.
- A fresh check runs when the user retries or returns to the Mini App.
  No automatic retry loops or page-wide third-party SDK fetches are added.

### 3. Diagnostics and follow-up beyond this hotfix

- Observe `503` at `/api/image`, `/api/recommendations`, and
  `/api/telegram/subscription-check`; distinguish `429` (limit) from
  `503` (upstream unavailable).
- Collect P50/P95 latency for public home/catalogue/episode routes and a
  breakdown of Supabase RPC and remote provider timeouts.
- Supabase is located in Tokyo and Railway in Europe; investigate reducing
  RTT, connection-pool saturation and database outage behaviour.
- Audit memory and cold-build dependencies. This patch **does not claim to
  solve** unrelated slow server-rendered pages whose data still needs Supabase.
- Do not move sensitive writes to per-instance budgets.
- Rollout: draft PR -> Quality Gate / full Next build -> staged smoke ->
  explicit production deployment after approval. No schema migration.

## Acceptance

- Two same-IP public requests pass under a budget of two; third returns 429
  with finite Retry-After; TTL restores access; scopes are independent.
- Unverified CF-IP spoofing does not bypass a bucket; verified origin is respected.
- More than 4096 unique active identities cannot expand the in-memory map.
- Public endpoints avoid `consume_api_rate_bucket`. Auth, Telegram session,
  purchases and signed uploads retain their fail-closed guard.
- Mini App subscription true/false/unavailable are distinct, and outage
  cannot grant access or falsely say a user unsubscribed.
- Full prebuild, TypeScript, lint and existing media/analytics/security suites pass.
