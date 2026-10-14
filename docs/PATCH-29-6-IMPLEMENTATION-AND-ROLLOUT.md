# Patch 29.6–29.11: implementation and rollout

## Changes

- Durable per-user/episode/UTC-day accepted-time ledger. Backfill and INSERT/UPDATE-delta trigger installation run under the same transaction/locks. DELETE retention preserves aggregates. RLS and server-only grants protect writes.
- Durable competitive restriction records survive analytics retention. Week/month eligibility is applied before ranking/limit; all-time preserves profile progress.active_ms. True me.rank is retained outside top-100. The current user receives a private participation explanation; other users do not receive internal trust signals.
- Shared capped period calculation for current week/month and archives. Conservative coverage watermark prevents incomplete histories from becoming official rankings or rewards.
- Bounded missing-period catch-up, operational lease, UTC validation and advisory lock, repeat-safe season creation. Existing legacy archives are preserved. Partial periods remain visible without an invented podium. Reward materialization retries and refuses to proceed if restriction data is unavailable.
- Admin health panel at /admin/health: last job, missing/partial periods, coverage and service-authenticated read-only calculation preview.
- Chat uses shared identity geometry and selected profile frame. Image zoom is clipped within the avatar, not allowed to spill over the frame. Static level/season frames preserve the one-frame slot.
- Genre collection uses successful-data cache, 5-second provider budget and durable genre-filtered catalog documents on failure. Errors/empty results are distinguished. Retry and catalog links preserve genre. Catalog discovery supports the linked genre filters.
- Contains the earlier visual leaderboard changes from PR #219. This combined PR can supersede #219; do not double-apply its changes.

## Validation performed locally

- Actual SQL migration executed in isolated PGlite/Postgres engine with synthetic rows: migration syntax, transactional backfill, deduplicated heartbeat, update delta, immutable event identity, per-period cap across days, UTC end exclusion, retention independence, persisted restrictions, all-time parity, repeat/partial/future archives, me beyond 100, RLS, service-only RPCs, read-only preview.
- TypeScript and targeted ESLint; existing prebuild quality gates.
- Genre recovery tests: matching local fallback, exclusion of unrelated genre, empty/unavailable states, recovery after failure, successful cache reuse, selected genre preservation in catalog URL.
- Browser CSS/DOM fixtures: 105 chat combinations from actual shared frame resolver, five widths and three zoom levels. Centers align; decoration does not overlap text. These fixtures do not replace production verification after deployment.
- Read-only production check found 193 Psychological genre documents with posters. Production schema was unchanged during implementation; subsequent authorized migration application is recorded below.

## Deployment order

1. Inspect pending migration history. Apply only the durable-periods migration transactionally; do NOT blindly push all repository migrations, including the later scheduler migration. Its lock timeout aborts safely if an ingestion transaction is busy; retry at a quieter point after inspection.
2. Verify ledger vs retained heartbeats by user/episode/day and compare October/week live outputs, all-time profile sums, grants/RLS and coverage watermark. Verify no daily aggregate has negative time.
3. Provision a dedicated random secret in Railway as LEADERBOARD_CRON_SECRET and in Supabase Vault as animebox_leaderboard_cron_secret. Never print/copy the value into Git, URL or logs. Reuse matching credentials if already provisioned.
4. Deploy the application commit and verify real API, restricted-user explanation, mini-profile triggers, chat frames, genre cards and admin health.
5. Install leaderboard_railway_scheduler_v1 with both jobs dormant (this can be done before deployment once matching credentials exist). AFTER endpoint deploy, activate only these two named jobs. Primary 00:20 UTC; retry 01:20 UTC when no application success. Verify real HTTP success and system_job_runs; a pg_net enqueue is insufficient.
6. Run one authorized season catch-up and verify complete 5–11 October, visible partial 28 September–4 October if coverage remains incomplete, existing September archive unchanged and no duplicate rewards. Code can create a trustworthy archive only from trustworthy source coverage.

## Historical limits

28 September's already-deleted portion is not reconstructed from lifetime progress. Backup/PITR extraction, if available, must happen in isolation, with source validation and a dry-run comparison before an explicitly scoped repair. The patch intentionally does not fabricate hours or retroactively rewrite September winners.

New recovered complete seasons use the existing reward materialization/claim policy; previously issued prizes remain unchanged. Partial seasons cannot issue rewards. Source-based repair of partial periods and arbitrary legacy reward reassignment are separate operator actions, not triggered by the health preview.

## Rollback

Revert application changes only while retaining the new ledger and the 60-day rollout retention. Do not drop aggregates/restrictions or restore 14-day retention while any deployed calculation still depends on raw history. Disable only the two new named cron jobs if necessary. Keep a schema-compatible application until traffic is moved away; do not present an incomplete raw-history calculation as an accurate fallback.

## Production migration application — 14 October 2026

Authorized by the user's request to apply migrations. Applied versions in Supabase history:

- 20261014081146: leaderboard_durable_periods_v1.
- 20261014081452: leaderboard_railway_scheduler_v1.

Repository filenames are aligned with the database-assigned versions, preventing a future CLI push from replaying the same DDL under older local timestamps. Both cron jobs are installed with active=false until PR #220 is deployed. Dedicated credentials exist in Vault and both Railway services; setting them used skipDeploys=true. No app deployment or restart was performed.

Verification: 62 daily aggregate rows, zero mismatches against retained accepted heartbeats, zero negative totals, zero lifetime/profile mismatches. Existing archive fingerprint was unchanged immediately after schema migration. RLS enabled; anon/authenticated cannot access private aggregates or execute health RPC. Raw retention is now 60/60 days.

Conservative full-coverage watermark: 2026-10-03 UTC. 5–11 October has complete source coverage and is finalized with five participants. 28 September–4 October is partial, without entries or prize assignment. Existing September winners are preserved. No reward materialization, prize notification or claim was performed during database recovery.

Remaining after application deployment: activate both cron jobs and run a protected catch-up once so missing reward materialization can proceed through the normal application path; verify application-level execution.
