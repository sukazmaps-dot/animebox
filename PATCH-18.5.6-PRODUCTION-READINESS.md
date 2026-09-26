# Patch 18.5.6 — Production Readiness / Thousands of Users

## Mission

18.5.5.x made AnimeBox safer under upstream failures, multi-instance refresh stampedes and crawler growth.

18.5.6 adds the missing operator layer:

- know when the platform is approaching pressure;
- degrade optional work before playback/auth/core pages are affected;
- stop individual subsystems without redeploying;
- guarantee that scheduled work does not overlap across instances;
- keep cron execution inside a serverless time budget;
- bound operational-table growth;
- provide a repeatable incident/rollback procedure.

The patch intentionally avoids claiming a fake exact "maximum users" number. Capacity is represented by measured headroom and pressure signals.

---

## 1. Emergency control plane

New table:

`public.system_runtime_controls`

Controls:

- `platform_mode = normal | brownout`
- `recommendations = enabled | disabled`
- `smart_discovery = enabled | disabled`
- `watch_together = enabled | disabled`
- `community_writes = enabled | disabled`
- `background_jobs = enabled | disabled`

Security:

- RLS enabled;
- no `anon` or `authenticated` grants;
- service role receives SELECT / INSERT / UPDATE only;
- admin mutation endpoint still requires AnimeBox owner/admin auth and CSRF protection;
- every change is written to admin audit.

Runtime reads are cached for five seconds per instance.

User-facing paths fail open if the control registry itself is unavailable: an outage in the emergency control plane must not become a platform outage.

Background jobs are more conservative: if the control plane cannot be read, non-critical jobs pause instead of doing expensive work without operator state.

---

## 2. Brownout mode

Brownout protects core viewing/auth/catalog capacity by reducing optional work.

### Recommendations

In brownout:

- request still succeeds;
- result limit is reduced;
- expensive mixed candidate sources are replaced by popularity/ranked paths;
- background availability refresh is suppressed;
- response exposes `X-AnimeBox-Degraded: brownout`.

An explicit recommendations kill-switch returns temporary 503.

### Smart Discovery

Discovery is optional enrichment and is completely shed during:

- operator brownout;
- local severe upstream pressure;
- explicit kill-switch.

### Watch Together

Brownout closes new/high-cost admission:

- room listing returns an empty degraded result;
- room creation returns 503;
- existing WebRTC rooms are not forcibly terminated.

This keeps active sessions alive while stopping new room pressure.

### Community writes

Comment reads remain available.

New comment writes pause in brownout/kill-switch mode with a temporary 503.

### Local soft brownout

Recommendations and Smart Discovery can also react to this Vercel instance's own upstream pressure:

- total protected upstream queue >= 20; or
- at least two local upstream circuits open.

This does not globally change the stored platform mode. It is an instance-local load-shedding decision.

---

## 3. Capacity model

System Health now combines:

- DB current connections;
- DB max connections;
- DB connection usage %;
- API p95 and 5xx;
- playback discovery exhaustion/readiness;
- protected upstream queues;
- open upstream circuits.

Current operational thresholds:

- database degraded >= 70%
- database critical >= 85%
- API degraded when established telemetry crosses existing p95/error limits
- API critical at established 5xx threshold
- upstream queue degraded >= 10
- upstream queue critical >= 25

System Health exposes:

- capacity state;
- DB headroom %;
- pressure signal count;
- bottleneck identifiers;
- whether brownout is recommended;
- whether brownout is already active.

A recommendation is shown when capacity is critical or when several degraded signals are simultaneously active.

It is intentionally an operator signal, not an automatic global database write.

---

## 4. Admin emergency controls

New endpoint:

`/api/admin/system-health/controls`

GET:

- owner/admin only;
- private no-store;
- shows the current control snapshot.

PATCH:

- owner/admin mutation protection;
- validates the exact known control/state matrix;
- updates only one control;
- writes `runtime_control_updated` to admin audit.

The System Health dashboard exposes these switches directly.

---

## 5. Distributed cron guard

New helper:

`lib/operational-job-server.ts`

Every protected job receives:

- shared runtime-control check;
- distributed `system_job` lease;
- bounded runtime budget;
- `remainingMs()`;
- `shouldStop(reserveMs)`;
- idempotent release.

The 18.5.5.3 lease primitive is reused instead of creating another lock table.

Lease TTL maximum increases from 60 seconds to 120 seconds so a 60-second serverless job can own a 90-second safety lease.

Only one instance may execute a given job key while its lease is alive.

---

## 6. Protected scheduled jobs

18.5.6 guards:

- catalog availability;
- SEO anime index;
- Boosty premium verification;
- premium lifecycle;
- episode notifications;
- production maintenance.

Non-critical background refresh jobs pause in manual brownout.

Premium lifecycle and maintenance can continue during brownout because entitlement correctness and pressure cleanup are operationally useful.

Every route releases its lease in `finally`.

---

## 7. Hard time budgets

A Vercel function must not be killed in the middle of an uncontrolled batch.

Jobs now reserve several seconds before the 60-second platform limit.

Examples:

- SEO stops before starting another source shard;
- Boosty stops before another user verification;
- episode notifications stop before another provider/delivery batch;
- premium lifecycle can skip secondary leaderboard finalization if time is low.

A budget stop is recorded as degraded instead of pretending the job completed fully.

---

## 8. Isolated maintenance job

New job:

`/api/cron/production-maintenance`

Vercel schedule:

`17 5 * * *`

Responsibilities:

- operational telemetry retention;
- old system job runs;
- resolved incident retention;
- old request-metric buckets;
- old product-event telemetry;
- expired refresh/job lease rows;
- stale/expired Watch Together room cleanup;
- old API rate buckets.

The maintenance job:

- is cron-authorized;
- uses a distributed lease;
- uses a hard time budget;
- runs cleanup tasks with `Promise.allSettled`;
- reports partial cleanup as degraded rather than failing the entire run.

Maintenance is allowed during brownout because it lowers storage/operational pressure.

---

## 9. Retention policy

The service-role-only RPC:

`prune_animebox_operational_data`

bounds only operational/telemetry data:

- `system_job_runs`: 30 days
- resolved `system_incidents`: 30 days
- `system_request_metrics`: 30 days
- `product_events`: 180 days
- expired `runtime_refresh_leases`: 24 hours after expiry

It does **not** delete:

- profiles;
- watch progress;
- comments;
- subscriptions/entitlements;
- payment history;
- copyright records;
- user anime lists.

Retention arguments are clamped inside SQL.

---

## 10. Production health database headroom

`animebox_production_health_snapshot()` now returns:

- current database connections;
- configured `max_connections`;
- connection usage percentage;
- cache hit percentage.

Execution remains service-role-only.

The existing privileged health function is kept because it must read PostgreSQL/cron/watch telemetry unavailable to normal browser roles. Execute grants are explicitly revoked from public/anon/authenticated.

---

## 11. Cron ownership cleanup

Before 18.5.6 unrelated jobs performed cleanup as side effects:

- catalog availability pruned request telemetry;
- premium lifecycle cleaned Watch Together rooms and API rate buckets.

This made emergency control ambiguous.

18.5.6 separates responsibilities:

- business/background jobs do their own work;
- production maintenance owns retention/cleanup.

Legacy regression checks were updated to verify the invariant (daily retention exists) rather than a historical file location.

---

## 12. Compatibility fixes discovered by real Vercel builds

### Smart Playback / Video SEO gate

18.5.5.5 moved video sitemap discovery behind:

`robots.txt → /sitemap-index.xml → /video-sitemap.xml`

The old smart-player regression required the video sitemap to appear directly in `robots.ts`.

The gate now accepts either:

- direct video sitemap advertisement; or
- advertisement through the sitemap index.

The new sitemap architecture remains unchanged.

### 18.5.3 request observability gate

The old test required telemetry pruning specifically in the catalog cron.

It now accepts:

- the historical catalog-owned cleanup; or
- the protected scheduled production-maintenance path.

---

## 13. Failure behavior

### Control-plane Supabase read fails

User requests:

- fail open to normal feature availability;
- snapshot marks `degraded = true`.

Non-critical cron jobs:

- pause on degraded control-plane state.

### Distributed lease RPC fails

Lease helper keeps its existing fail-open resilience semantics.

The job still carries a degraded marker.

### Local upstream pressure

Optional intelligent/enrichment workloads shed first.

Playback/source orchestration keeps its dedicated 18.5.5.4 circuit/concurrency policy.

### Database connection pressure

System Health reports reduced headroom and can recommend brownout.

No automatic global brownout is written solely from one request/process observation.

---

## 14. Manual read-only load drill

Command:

`npm run load:readiness`

The drill is intentionally **not** part of prebuild.

Safety:

- refuses to start without `ANIMEBOX_LOAD_TEST_ALLOW=1`;
- requires an explicit base URL;
- production hostname additionally requires `ANIMEBOX_LOAD_TEST_PRODUCTION=I_UNDERSTAND`;
- GET/read-only routes only;
- max concurrency is clamped to 40;
- phases are 100 / 500 / 1000 / 2000 total requests;
- phases stop if error rate reaches 5%;
- reports throughput, status distribution, degraded responses and p50/p95/p99;
- waits between phases instead of stacking bursts.

The default target should be a Vercel Preview/Staging deployment.

Authenticated watch-start/heartbeat write-load is intentionally not automated by this script because it would create real user/session state. That class of test should use a dedicated staging account and isolated dataset.

---

## 15. Regression gate

New command:

`npm run patch18-5-6:check`

It verifies:

- control table / RLS / least-privilege grants;
- valid control state matrix;
- fail-open user-facing behavior;
- local-pressure soft brownout;
- audited admin endpoint;
- protected recommendation/discovery/WT/community paths;
- `system_job` distributed lease;
- 90-second job lease support;
- cron time budgets and final lease release;
- isolated daily maintenance schedule;
- bounded retention RPC;
- DB max connection/headroom fields;
- capacity thresholds;
- System Health control UI;
- compatibility of old video-SEO and observability regression gates;
- package/prebuild wiring.

---

## 16. Live Supabase verification

Migration:

`20260926093845 production_readiness_v1`

Live smoke verification includes:

- six default controls exist;
- all defaults are normal/enabled;
- anon cannot SELECT controls;
- authenticated cannot SELECT controls;
- service role can SELECT/INSERT/UPDATE;
- service role cannot DELETE controls;
- retention RPC execute is service-role-only;
- production health RPC execute is service-role-only;
- health snapshot returns current/max/percentage connection metrics;
- distributed job lease prevents a competing owner during the TTL;
- retention RPC transaction smoke completes without touching user domain data.

At implementation time the live database snapshot reported 15/60 connections (25% usage). This is a point-in-time observation, not a capacity guarantee.

---

## 17. Release gates

Before merge:

1. old regression chain passes;
2. `patch18-5-6:check` passes;
3. Next/TypeScript production build passes;
4. Supabase Security Advisor reviewed;
5. Supabase Performance Advisor reviewed;
6. live control grants/RPC grants verified;
7. Vercel preview succeeds;
8. emergency controls remain default normal/enabled;
9. merge to main;
10. production deployment smoke-check.

---

## 18. Success criteria

18.5.6 succeeds when:

- an operator can reduce optional load without redeploying;
- one slow instance can shed optional intelligent work locally;
- scheduled jobs cannot normally overlap across Vercel instances;
- long batches stop before the serverless deadline;
- operational tables have bounded retention;
- cleanup is independent from business jobs;
- database pressure is shown as real headroom, not an invented user-capacity number;
- existing viewing/catalog/copyright/SEO invariants remain intact.
