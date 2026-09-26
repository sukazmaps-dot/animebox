# AnimeBox Production Runbook

## 1. First response

When production looks unhealthy:

1. Open **Admin → System Health**.
2. Check:
   - overall status;
   - capacity state;
   - DB headroom;
   - API 5xx / p95;
   - playback discovery exhaustion;
   - upstream queue/circuits;
   - open incidents;
   - failed/degraded jobs.
3. Do not change several controls at once unless the platform is already critical.
4. Record the observed bottleneck before toggling a control.

---

## 2. When to enable brownout

Consider `platform_mode = brownout` when:

- System Health marks capacity critical; or
- it recommends brownout because several degraded signals are active; or
- DB connection usage is approaching the critical threshold; or
- API latency/errors rise while optional routes are busy.

Brownout currently:

- simplifies recommendations;
- stops recommendation availability refresh work;
- disables Smart Discovery;
- pauses new/public Watch Together room admission;
- pauses new comment writes;
- pauses non-critical background jobs.

It does **not** intentionally disable:

- login/auth;
- anime information pages;
- existing playback orchestration;
- progress writes;
- already-running P2P rooms;
- premium lifecycle;
- production maintenance.

After pressure normalizes, set `platform_mode = normal` and watch System Health for several minutes.

---

## 3. Feature kill switches

Use a feature switch when one subsystem is the problem and the whole platform is otherwise healthy.

### recommendations

Disable if recommendation traffic or candidate enrichment is causing pressure.

### smart_discovery

Disable if discovery/search enrichment is slow or upstream-heavy.

### watch_together

Disable new room admission if WT room/control traffic is unstable.

Existing P2P sessions are not forcibly killed by the rooms API switch.

### community_writes

Disable during comment-write abuse, moderation incident, or write-path DB pressure.

Reads remain available.

### background_jobs

Use only when scheduled/background work itself is contributing to an incident.

Remember that this pauses non-critical guarded jobs. Production maintenance/premium lifecycle behavior should be reviewed before leaving the switch disabled for a long time.

---

## 4. Database connection pressure

System Health reports:

- current connections;
- max connections;
- connection usage;
- remaining headroom.

Operational thresholds:

- >= 70%: degraded warning;
- >= 85%: critical.

If DB pressure is high:

1. Enable brownout if not already active.
2. Inspect API p95/5xx and top bottlenecks.
3. Disable the optional feature producing the pressure if identifiable.
4. Check Supabase Database/Query performance.
5. Check `pg_stat_statements` for sudden call-count or total-time growth.
6. Do not add speculative indexes during the incident unless the slow query is identified.

---

## 5. Upstream/provider incident

### Kodik / AniLiberty / Direct

System behavior should already:

- bound concurrency;
- open circuit breakers;
- shed queued requests;
- preserve verified-first catalogue state;
- avoid translating a timeout into confirmed unavailable.

If a provider remains unhealthy:

1. Check System Health provider state.
2. Use existing Player Source controls to disable that provider if needed.
3. Do not disable the whole platform solely because one player provider is down.

### AniList / Shikimori

If metadata upstreams fail:

- cached/local data should continue where available;
- optional enrichment can be shed;
- SEO sitemaps do not call AniList directly.

Brownout can further reduce optional metadata work.

---

## 6. High API 5xx

If API error rate crosses the established critical threshold:

1. Open route-level metrics in System Health.
2. Identify whether errors cluster around one route.
3. Check incidents/request IDs.
4. Check DB headroom and upstream circuits.
5. Disable only the affected optional subsystem when possible.
6. Enable brownout if pressure is cross-cutting.

Do not treat a rate-limit 429 burst as a provider/database outage.

---

## 7. Cron/job failure

Guarded jobs use:

- cron authorization;
- distributed `system_job` lease;
- time budget;
- System Health job journal.

Expected skip reasons:

- `already_running` — another instance owns the job;
- `brownout` — non-critical background work paused;
- `background_jobs_disabled` — operator switch;
- `control_plane_degraded` — non-critical job paused because controls could not be read.

A skipped job is not automatically an incident.

Repeated `failed` or budget-exhausted/degraded jobs require investigation.

---

## 8. Production maintenance

Daily maintenance owns:

- request telemetry retention;
- job history retention;
- resolved incident retention;
- old product-event retention;
- expired runtime leases;
- stale Watch Together room cleanup;
- old API rate bucket cleanup.

If maintenance fails for one day, the site should continue working. Repeated failures can cause unbounded operational-table growth and should be fixed.

---

## 9. Bad deployment

If a deployment introduces a user-facing regression:

1. Check Vercel deployment logs.
2. Distinguish:
   - prebuild regression failure;
   - TypeScript/Next compilation failure;
   - Vercel infrastructure/rate-limit failure.
3. Do not merge a branch with a known application build failure.
4. If production is already affected, use Vercel rollback/redeploy of the last known-good deployment.
5. Runtime controls can reduce optional traffic while rollback completes.

After rollback:

- verify home/catalog/anime page;
- verify one playback start;
- verify auth/profile;
- verify System Health;
- verify DB headroom;
- verify cron endpoints are not accidentally public.

---

## 10. Post-deploy smoke checklist

After a production deploy:

- homepage loads;
- catalogue loads;
- anime detail page resolves canonical slug;
- one episode playback source resolves;
- watch progress start/heartbeat/end path remains alive;
- recommendations respond;
- Smart Discovery responds in normal mode;
- System Health opens;
- runtime controls show normal/enabled;
- sitemap index responds;
- no unexpected critical incidents;
- DB connection headroom remains normal.

---

## 11. Emergency recovery defaults

Normal expected control state:

- `platform_mode = normal`
- `recommendations = enabled`
- `smart_discovery = enabled`
- `watch_together = enabled`
- `community_writes = enabled`
- `background_jobs = enabled`

If an incident ends, restore intentionally changed controls one at a time and verify pressure after each restoration.
