# Patch 18.5.5.4 — Production Load & Failure Shield

## Mission

AnimeBox already has:

- verified-first catalogue availability;
- bounded playback discovery timeouts;
- provider health/cooldown state;
- local in-flight deduplication;
- distributed refresh leases for hot catalogue/metadata refreshes;
- request observability and System Health.

Patch 18.5.5.4 closes the next production-scale failure mode: **cascade amplification**.

A traffic spike must not turn one slow upstream into hundreds of concurrent outbound requests, thousands of queued promises, retry storms, or false provider outages.

The patch therefore adds a bounded load/failure layer in front of the expensive external providers while preserving all existing availability and copyright invariants.

---

## 1. Protected upstreams

The runtime shield covers:

- AniList;
- Shikimori;
- Kodik;
- AniLiberty / AniLibria mirrors;
- AnimeBox Direct / Alloha.

Each provider gets a separate per-instance budget. A slow provider cannot consume the entire serverless instance's outbound capacity.

### Current budgets

| Upstream | Active concurrency | Max queue | Queue timeout | Failure threshold | Open duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| AniList | 6 | 36 | 450 ms | 4 | 12 s |
| Shikimori | 5 | 30 | 450 ms | 4 | 18 s |
| Kodik | 8 | 40 | 300 ms | 4 | 10 s |
| AniLiberty | 5 | 28 | 350 ms | 4 | 15 s |
| Direct | 4 | 20 | 250 ms | 3 | 15 s |

These are deliberately conservative serverless **per-instance** limits. They are not global quotas and do not claim to represent provider-side contractual rate limits.

---

## 2. Bounded backpressure

New module:

`lib/upstream-resilience-server.ts`

Every protected operation goes through `runWithUpstreamBudget()`.

Rules:

1. If an active slot exists, start immediately.
2. Otherwise wait in a bounded FIFO queue.
3. If the queue is full, fail fast with `queue_full`.
4. If the queue wait exceeds its small budget, fail with `queue_timeout`.
5. Client cancellation leaves the queue immediately.
6. No request is allowed to create an unbounded backlog.

The pressure error is internal and typed:

- `queue_full`
- `queue_timeout`
- `circuit_open`
- `aborted`

Playback routes translate pressure into controlled temporary responses rather than pretending that an episode does not exist.

---

## 3. Circuit breaker

Each protected upstream tracks process-local consecutive transient failures.

Transient provider evidence includes:

- HTTP 429;
- HTTP 5xx;
- network/transport failures;
- provider timeouts when the caller can distinguish them from client cancellation.

When the configured threshold is reached:

- the circuit opens for a short cooldown;
- already queued requests are immediately shed;
- new requests fail fast with `circuit_open`;
- the dead upstream is no longer hammered by an old queue.

A successful request closes the local circuit and clears its failure streak.

This process-local breaker complements, rather than replaces, the existing database-backed playback provider runtime state.

---

## 4. Retry storm prevention

`lib/fetch-retry.ts` remains the shared AniList/Shikimori retry helper but now:

- recognizes protected upstream URLs;
- executes attempts inside the upstream budget;
- caps retry attempts at 3;
- caps the base delay;
- never retries an `UpstreamPressureError`;
- does not turn caller cancellation into retry work.

This keeps the existing transient recovery behavior without multiplying a pressure event into several new requests.

---

## 5. Distributed half-open recovery

The existing playback provider state already has a database-backed cooldown.

The dangerous edge was cooldown expiry:

> many Vercel instances can observe the same expired cooldown and all probe the provider at once.

Patch 18.5.5.4 adds lease scope:

`player_provider_half_open`

When a provider's previous state is `unavailable` and its cooldown has just expired:

1. policy marks the provider as `halfOpenProbe`;
2. the route calls `claimProviderHalfOpenProbe()`;
3. the existing distributed refresh lease RPC elects one recovery probe;
4. non-owners return `provider_recovering` + a short `Retry-After`;
5. the winning probe reports its result synchronously so the shared runtime state is updated before the route returns.

The lease remains fail-open if Supabase coordination itself is temporarily unavailable. Availability is never made dependent on the optimization.

---

## 6. Playback route behavior

### Kodik

- protected by the Kodik concurrency/circuit budget;
- distributed half-open recovery gate;
- overload returns `server_busy`, not a false episode absence;
- pressure is not recorded as a Kodik provider failure;
- real provider errors still update provider health.

### AnimeBox Direct

- Alloha lookup uses the Direct budget;
- pressure returns `server_busy`;
- `server_busy` does not increment provider failures;
- half-open recovery is distributed.

### AniLiberty

- individual mirror/API calls use the AniLiberty budget;
- overload stops mirror fan-out early;
- route returns a controlled temporary state with `Retry-After`;
- local AnimeBox pressure is kept separate from real upstream failure;
- half-open recovery is distributed.

---

## 7. Catalogue safety

Failure protection must never weaken the existing verified-first model.

Required invariants remain:

- a confirmed source hit => `playable`;
- timeout / 429 / 5xx / pressure => `unknown`, not `unavailable`;
- a never-verified title with confirmed misses can remain hidden;
- a previously playable title requires the existing confirmed-miss shield before becoming unavailable;
- `CONFIRMED_MISS_THRESHOLD = 3`;
- previously verified titles retain bounded degraded grace;
- a provider outage must not mass-remove catalogue entries.

AniLiberty catalogue probing now explicitly converts local backpressure into `unknown`.

---

## 8. System Health

System Health now exposes the current server instance's upstream shield state.

For every provider:

- active work;
- configured concurrency;
- queued work;
- max queue;
- consecutive failures;
- circuit state;
- circuit expiry;
- accepted operations;
- shed/rejected operations;
- circuit-open count.

Top-level signals include:

- `upstreamCircuitOpen`;
- `upstreamQueued`.

A currently open local circuit marks the System Health snapshot degraded.

Important: these counters are **instance-local live pressure indicators**, not a globally aggregated historical metric.

---

## 9. Supabase pressure review

No new table, index, RPC, policy, or DDL is required by this patch.

The distributed recovery gate intentionally reuses the service-role-only refresh lease system from 18.5.5.3.

Production review used:

- current Supabase connection-pooling guidance for horizontally scaling/serverless workloads;
- `pg_stat_statements` to inspect accumulated query cost/call volume;
- final Security and Performance Advisor checks.

No database schema expansion is justified solely to implement local provider backpressure.

---

## 10. Failure matrix

The release must preserve useful behavior under the following conditions.

### Kodik 429 / 5xx

Expected:

- bounded requests;
- circuit eventually opens;
- queue is shed;
- catalogue treats ambiguity as unknown;
- playback may fall back to another provider.

### AniLiberty slow/down

Expected:

- bounded mirror concurrency;
- no unbounded mirror/query queue;
- catalogue does not falsely mark titles unavailable;
- playback reports temporary unavailability and continues provider fallback.

### AniList/Shikimori pressure

Expected:

- bounded concurrency;
- capped retry count;
- no retry after the local pressure shield rejects work;
- existing cached/localized fallback paths remain usable.

### Direct provider slow/down

Expected:

- strict small concurrency budget;
- fast shedding under excess load;
- no false provider failure caused by AnimeBox's own queue pressure.

### Supabase lease coordination unavailable

Expected:

- half-open lease helper fails open;
- request availability is preserved;
- local circuit/concurrency shield still works.

---

## 11. Regression gate

New command:

`npm run patch18-5-5-4:check`

The gate performs both source invariants and executable runtime tests.

It verifies:

- every provider has a finite concurrency and queue budget;
- pressure has explicit typed reasons;
- circuit-open queue shedding exists;
- AniList/Shikimori retry path uses the shield and max 3 attempts;
- all three playback routes use distributed recovery gating;
- `server_busy` is not recorded as provider failure;
- verified-first catalogue semantics remain intact;
- System Health exposes the shield;
- package/prebuild wiring is valid.

Runtime matrix:

1. 30 concurrent healthy Shikimori operations:
   - max active must stay <= 5;
   - queue fully drains;
   - no rejection expected.

2. 80 concurrent Direct operations:
   - max active must stay <= 4;
   - excess work must be shed;
   - active/queue must return to zero.

3. Four consecutive AniList transient failures:
   - circuit must open;
   - next request must return `circuit_open`;
   - protected work must not execute after opening.

4. Already-aborted AniLiberty request:
   - must not increment provider failure evidence.

The check is wired into `prebuild` immediately after the 18.5.5.3 gate.

---

## 12. Release gates

Before merge:

- package.json parses;
- 18.5.5.4 regression gate passes;
- TypeScript/Next production build passes when Vercel build capacity is available;
- no new Supabase Security Advisor regression;
- no new Supabase Performance Advisor regression;
- existing playback/copyright/catalogue invariants remain wired.

A Vercel infrastructure quota/build-rate-limit is not equivalent to an application build failure and must be reported separately.

---

## 13. Success criteria

Patch 18.5.5.4 is successful when:

- a provider outage cannot create an unbounded in-instance queue;
- retries cannot amplify local pressure indefinitely;
- a circuit opening immediately stops queued pressure;
- cooldown recovery cannot create a multi-instance thundering herd under normal lease availability;
- AnimeBox backpressure is distinguishable from real provider failure;
- catalogue availability does not convert transient provider trouble into false takedowns;
- operators can see upstream pressure in System Health;
- the behavior is continuously enforced by the prebuild regression gate.
