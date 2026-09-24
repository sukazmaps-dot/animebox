# Patch 17.5 — Core Platform & Reliability

## Goal

Make AnimeBox observable and operable as a production service. A failure should
have a durable signal, a service owner should be able to see it from the admin
panel, and observability itself must never break the product path.

## Persistent observability

### system_job_runs
Service-role-only execution journal:
- job key
- succeeded / degraded / failed / skipped
- start / finish / duration
- compact result summary
- error code

### system_incidents
Deduplicated incident registry:
- stable fingerprint
- service
- warning / critical
- occurrence count
- first / last seen
- last message
- open / resolved lifecycle

Repeated failures update one incident instead of creating an unbounded error
stream.

## System Health

`/admin/health` now combines:
- watch sessions and heartbeats
- Watch Together room health
- PostgreSQL connection/cache metrics
- player provider runtime
- maintenance / reconciliation jobs
- episode notification worker
- open system incidents
- Vercel deployment SHA / branch / region when available

Admins can resolve an incident from the dashboard. Manual resolution is a
protected admin mutation and is persisted in `admin_audit_log`.

## Automated incident sources

Player provider circuit state:
- degraded provider -> warning incident
- unavailable provider -> critical incident
- healthy provider -> incident resolved

Observed jobs:
- Boosty Premium
- DonatePay sync
- episode notifications
- leaderboard season finalization
- premium lifecycle / cleanup
- Telegram Stars reconciliation

## Reliability rule

Observability is fail-open. Missing telemetry storage, a failed incident write
or an unavailable System Health registry cannot fail playback, billing jobs or
notification workers.

## Next tranche

17.5 continues with:
- environment/configuration readiness signals
- deploy health and release markers
- provider latency/SLO thresholds
- database slow-query / index regression snapshots
- webhook delivery health
- incident alert delivery
