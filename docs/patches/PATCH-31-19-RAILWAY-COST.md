# Patch 31.19 — Railway memory and cost

Baseline commit: `0995770` (31.18.1). Target: the existing `blissful-mercy` / `animebox` / production service, one replica, us-west2. No infrastructure, secret, resource-limit, region or sleep changes.

## Audit and evidence

Captured 18 October 2026. Machine-readable measurements: [Railway baseline](../metrics/patch31-19-railway-baseline.json) and [synthetic memory drill](../metrics/patch31-19-synthetic-memory.json). Neither file contains IPs, raw request headers, secrets or user records.

| Window before this patch | Average RAM (decimal MB) | Maximum RAM (MB) | Average CPU (vCPU) |
| --- | ---: | ---: | ---: |
| 1 hour | 587.65 | 1019.70 | 0.11509 |
| 24 hours | 641.66 | 1019.70 | 0.08863 |
| 168 hours | 558.89 | 1019.70 | 0.03211 |

The owner's earlier 691 MB average / 1939 MB peak are historical measurements from a different sample. The new baseline does not prove OOM is solved. Railway summaries do not distinguish RSS, heap, external buffers, post-restart growth or request concurrency. No heap snapshots or sensitive production diagnostics were taken. Earlier OOM alerts cannot be attributed to one module from these summaries alone.

168h HTTP totals: 370,617 requests, 354,165 2xx, 612 3xx, 12,578 4xx, 3,262 5xx (0.88%). Approximately 52,945 requests/day averaged across this week; traffic is highly uneven. Image proxy: 27,862 requests, 1,911 5xx. Recommendations: 4,719 / 347 5xx. Anime API: 1,104 / 140 5xx. These counts are separate rolling queries, not a synchronized invoice extract. 24h latency buckets range p50 12–202 ms, p95 980–3677 ms, p99 2509–30000 ms; bucket percentiles must not be averaged into a global percentile.

The latest bounded log sample contains 501 requests over approximately four minutes. Its TOP-20 with counts, errors and sample p95 is in the baseline JSON. `/api/image` leads with 41 requests (sample p95 64 ms); anime detail has 29 requests (sample p95 1951 ms). This is **not a weekly top-20**. 438 UAs claim GPTBot, one claims SemrushBot; authentication of these claims is unavailable. Remaining requests cannot reliably be split into people, verified search bots, monitoring, internal jobs and unknown automation without trusted edge metadata. No raw IPs are retained in this report.

The deployment inventory shows 19 creations on Oct 17, including failures and repeated manual deployments, not 19 distinct releases. Last pre-patch deployment `9ee8beda-5bb5-47a0-a1b2-79af0d13797d` runs `0995770`. Creation to image push took approximately 132 seconds; this includes more than compilation. Build logs show a 349.6 MB pushed image. No evidence of a second Next server in the start command (`next start`); process inventory inside the container was not available. No restart policy was used to hide memory growth.

## Three concrete sources addressed

1. **Image buffers and admission.** The fallback route retained chunks, assembled a full copy, made another typed-array copy at response creation and had no global cap on concurrent origins. It also used Next `force-cache` in addition to its own cache. The route accounts for 58.6% of the week's 5xx counts, but this alone does not establish their cause. Synthetic execution of the historical route verifies the allocation and concurrency problem.
2. **Variable-size public result caches.** Entry counts were bounded, but there was no byte budget; cold expired keys were retained until eviction. Now the existing helper accounts for retained size, sweeps expiry on activity (no maintenance timer), evicts to both budgets, exposes key-free local statistics, and preserves deduplication and stale-on-error expiry. Public cache contents remain public. This is a bounded retention fix, not proof of a production heap leak.
3. **Jikan poster lookup.** An independent Map had no TTL, entry limit or single-flight and its fetch had no deadline. It now uses the existing public helper (256 entries, 512 KiB accounted budget, 24h TTL, 4s deadline). Twenty simultaneous identical reads produce one upstream call. Errors retain failure statuses and no-store headers and never enter the success cache.

## Implementation

- `lib/public-result-cache.ts`: shared entry/byte budgets, expiry accounting, cancellation-aware subscribers and local `stats()`. JSON budget is twice UTF-8 serialized size plus key/entry allowance, an estimate rather than a hard measurement of V8 object size. Binary callers count backing allocations. Oversize values are served without retention. Cache hits do not serialize again. One disconnected waiter never cancels another waiter; the last one aborts its shared loader.
- Public helper budgets: anime base 8 MiB/1000 entries/30 min (+existing 6h stale-if-error); localization 4 MiB/1000/60s; saved batches 4 MiB/128/30s; lexical search 2 MiB/128/30s; hero art 2 MiB/16/15 min; image 8 MiB/64/60s with existing 1 MiB per-image eligibility; Jikan 512 KiB/256/24h. These budgets are per module instance/process, not a global quota or multi-replica shared cache. Binary cache admission includes unused backing-array capacity.
- `lib/bounded-work.ts`: four active image loads and 32 queued unique loads. Queue and body share the original 8s deadline. Queue overflow is a no-store 503 with Retry-After, never a cached successful placeholder. Slots are released on success, failure and cancellation.
- `app/api/image/route.ts`: one growing destination buffer, no chunk retention, no redundant typed-array copy before Response. Native Response still owns its normal body allocation. Size is enforced on actual bytes, regardless of Content-Length; truncated bodies fail. Large images still work without retained caching. Full buffering remains intentional: reject invalid/oversize data before 200, retain fallback semantics and share completed loads. Legacy non-strict SVG placeholder compatibility is preserved; normal strict candidates return 502 on origin failure. Client disconnect returns no-store 499.
- `lib/image-upstream-server.ts`: native HTTPS with address verification inside the socket DNS lookup, TLS hostname validation, manual redirects at the route, no environment proxy or separate unchecked second resolution. Private/special-use IPv4, mapped/private/link-local IPv6 and transition addresses are rejected, including mixed DNS answers. Every redirect still rechecks the existing HTTPS/host/port/credential allowlist. Response cancellation destroys the Node response stream. Identity encoding is requested; unsupported encoded bodies fail safely. Next's redundant image fetch cache is removed; the bounded cache and existing CDN headers remain.
- `app/api/jikan/anime/route.ts`: bounded public poster lookup, canonical numeric key, shared requests, deadline, meaningful failure statuses.
- Tests/scripts/workflow/package: independent `railway-cost:check`, synthetic memory drill, new lint in CI, and 412/1366 additions to the existing responsive matrix. Production build runs the new regression after the existing release-consolidation gate.

Other audited server maps already have count bounds: Russian titles 2500, franchise 100, community catalog 2000, availability registry 4000 and verified snapshot 2000, metadata persist coordination 1200, public rate limiter 4096. Their values are smaller identifiers/rows or already bounded franchise results. They were not replaced speculatively. The SQLite route registry uses disk on Railway; its Vercel-only in-memory fallback is not the active Railway path. Broader heap attribution and byte accounting for remaining variable-size standalone caches remain follow-up work; this patch does not claim every cache in the repository is now byte-bounded.

## Local performance comparison

Fresh Node v24.19.0 process per test, synthetic 10 MiB image origins, 64 KiB chunks, ~1ms/chunk, consumer drains responses. Historical code is loaded from `0995770`, including its historical cache. This is an isolated handler drill, **not Next production RSS, CPU billing or a normal poster benchmark**. The workflow uses the project's supported Node 22 separately.

| Concurrent unique images | Peak RSS before / after (MB) | Peak ArrayBuffers before / after (MB) | Active origins before / after | Batch elapsed before / after (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 145 / 138 | 53 / 42 | 1 / 1 | 200 / 194 |
| 5 | 292 / 249 | 189 / 153 | 5 / 4 | 247 / 409 |
| 10 | 461 / 300 | 357 / 210 | 10 / 4 | 305 / 622 |
| 20 | 536 / 431 | 399 / 336 | 20 / 4 | 416 / 1039 |

At 20 maximum-size origins peak RSS falls approximately 19.6%; at 10, 34.9%. The queue increases completion time for worst-case concurrent large files; one-file time is essentially unchanged in this synthetic sample. Do not claim an across-the-board API speedup. Raw baseline/heapUsed/external/ArrayBuffer/post-GC measurements are retained in JSON. Post-GC buffers return near baseline; RSS need not immediately fall because V8/allocator retain arenas. Normal-page production baseline and long observation still need production metrics.

Reproduce: `node --expose-gc scripts/railway-memory-drill.cjs before 20` and `after 20` (also 1, 5, 10). The before drill requires the baseline Git object. No stress tests, real writes, payments or notifications run against production.

## CDN, API, database and bot boundaries

The existing `image-service` / `media-delivery` chain already puts media.youranimebox.com variants before the bounded same-origin rescue. Presets already specify responsive widths 96–1440 and WebP/AVIF; the Worker checks edge cache then R2 and has short failure caching. This patch does not bypass a working CDN with a new image system, generate variants on Railway, redirect private media, or alter avatar/banner access. `/api/image` is a fallback/Worker relay, so eliminating it outright would regress Shikimori delivery.

The existing tracker, profile and notification client caches already provide account-scoped request sharing; no new client library was added. Public saved metadata reads already batch up to 50 IDs; availability and metadata persistence already have bounded reads/refresh coordination. No confirmed N+1 was changed. Recommendations/anime public cache policy, rate limiting, upstream circuits, 31.15/31.16 outage handling, RLS and all authenticated endpoints remain intact. No SQL migration is required.

Public home/anime HTML policies and private no-store boundaries were inspected and left unchanged. No new HTML, authenticated response or personal cache was made public. Authorization, cookies, Vary and user-specific APIs are not weakened. Tests retain independent cache/error assertions and existing outage regressions. A complete production CDN audit across cookie/Authorization/RSC combinations was not available.

No Cloudflare account/WAF/verified-bot analytics capability is connected in this environment. Therefore no live WAF/rate-limit rules were invented, duplicated or modified; no UA-only bot blocking or JavaScript challenges were added. A future edge change needs an inventory of existing rules and plan limits, trusted verified-bot exclusion for search engines, narrowly scoped API abuse thresholds and observation before enforcement. The existing in-process limiter remains explicitly per-instance, not a global multi-replica budget. Claims of reduced bot SSR or CDN HIT gains would be unmeasured here.

## Cost model and measurement limits

Current official [Railway pricing](https://docs.railway.com/pricing), retrieved 18 October 2026: RAM $10/GB-month, CPU $20/vCPU-month, egress $0.05/GB, storage $0.15/GB-month. Compute is charged by usage over time. Subscription is credited toward usage, not simply added twice.

Extrapolating the new **pre-patch** 168h average yields $5.59 RAM + $0.64 CPU = **$6.23/month compute only**. It is not a bill or remaining credit balance. For the owner's historical 0.691 GB / 0.0315 CPU, the same calculation is $7.54 compute/month. Network metric averages are not a verified billable egress total; neither was converted into a claimed invoice.

Conditional savings examples with unchanged CPU: sustained RAM falling from 0.5589 to 0.500 GB saves ~$0.59/month; to 0.400 GB saves ~$1.59/month. Every genuinely avoided 10 GB billable egress saves $0.50, but this patch has no measured avoided-egress amount. These are scenarios, not achieved or promised savings. No second-project deletion savings are counted. Billing/credit balance is unavailable.

| Requested production metric | Before | After / delta |
| --- | --- | --- |
| Average / peak RAM | Fresh 168h 558.89 / 1019.70 MB; historical 691 / 1939 MB | Not measured over a comparable post-release window |
| CPU | 0.03211 vCPU (168h) | Pending comparable window |
| Requests/day | ~52,945 (week average) | Pending comparable window |
| Image requests | 27,862 / 168h | Pending comparable window |
| API p95 | Bucket values only; see baseline JSON | Pending matching route/window |
| 5xx | 3262 / 370617 (0.88%) | Pending comparable window |
| Egress / CDN HIT / poster p95 | Billing/edge/poster telemetry unavailable | Not claimed |
| 30-day cost | $6.23 compute extrapolation, excludes verified egress/storage | Conditional scenarios only |

## Validation and release

Implementation validation and final release links are recorded in the PR and release section below. The 400–600 MB target is not guaranteed by the synthetic drill; the fresh pre-patch week already averages 559 MB but includes restarts and historical workloads. No V8 heap cap, feature disable, server sleep or forced restart is used to reach it.

Rollback: revert this patch's merge commit, let the existing main-branch deployment run, or roll back to pre-patch deployment `9ee8beda-5bb5-47a0-a1b2-79af0d13797d`. No schema/secret/config migrations need reversing. After deployment, inspect 5xx, image error reasons, CPU/RAM and latency in matching 1h/24h/168h windows. Check image delivery from real client regions; native HTTPS transport must be verified against live origins before calling the rollout healthy.

Local validation: independent Railway checks, 31.15/31.16 outage regressions, existing loading/media/tooltip tests, targeted ESLint, TypeScript and the full production prebuild/build passed. Local browser startup was blocked by missing Chromium; the existing GitHub Quality Gate installs Chromium and runs the extended matrix and editor/player browser regressions. Browser results must be read from CI, not inferred from the local build.
