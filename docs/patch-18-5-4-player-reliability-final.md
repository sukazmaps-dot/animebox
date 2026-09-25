# Patch 18.5.4 — Player Reliability Final

## Goal

Make playback the most reliable path in AnimeBox. A user who opens an episode should either get a working source quickly or a controlled, explainable failure state. Provider degradation, missing episode mappings, timeouts and copyright restrictions must never turn into a dead player, a wrong episode or an endless retry loop.

This release is split into three sub-patches:

- **18.5.4.1 — Source Orchestrator v2**
- **18.5.4.2 — Mobile + Resume Integrity**
- **18.5.4.3 — Playback Observability & Regression Matrix**

---

# 18.5.4.1 — Source Orchestrator v2

## 1. Single source-selection authority

The server-side player source policy becomes the canonical orchestration plan for every episode request.

The plan must combine:

- admin configured priority;
- provider enabled/disabled state;
- environment readiness;
- copyright restrictions;
- circuit-breaker cooldown;
- current runtime health state;
- recent provider latency;
- recent failure/success timestamps.

The browser may still keep device-local startup history, but it may only refine the order among server-approved sources. It must not revive a provider that the server disabled.

## 2. Health-aware effective priority

Each provider receives:

- configured priority;
- health penalty;
- effective priority;
- recommended request timeout.

Initial rules:

- healthy: no state penalty;
- unknown: small penalty;
- degraded: significant penalty;
- unavailable/cooldown: disabled;
- recent failure newer than last success: extra penalty;
- high last latency: bounded latency penalty.

The final order is deterministic: effective priority, configured priority, provider name.

## 3. Orchestrator response contract

`/api/player/source-policy` returns both the existing provider policies and an orchestration block:

- ordered provider keys;
- max provider attempts;
- total source discovery budget;
- whether playback is blocked by copyright;
- whether every source is currently unavailable;
- strategy version.

This keeps existing admin/provider controls compatible while allowing the client to stop inventing its own fallback order.

## 4. Sequential fast-start discovery

The episode page must stop firing multiple providers in parallel as the normal path.

Flow:

1. fetch source plan;
2. try primary provider;
3. if it returns a playable source, publish immediately;
4. mark source discovery ready and render player;
5. warm remaining server-approved fallbacks sequentially in the background;
6. if primary fails before publishing, immediately try the next provider;
7. stop after bounded attempts/budget.

Benefits:

- lower provider/API fan-out;
- fewer simultaneous requests on mobile;
- deterministic fallback behavior;
- faster diagnosis;
- no race where a lower-priority provider wins just because its response arrived first.

## 5. Per-provider discovery budgets

Recommended discovery timeout:

- Direct: ~5.5s;
- Kodik: ~7s;
- AniLiberty: ~9.5s.

The orchestration layer enforces its own timeout even if an individual provider endpoint has a bug.

The whole discovery session has a bounded budget. A provider timeout cannot keep the episode page loading indefinitely.

## 6. Failure semantics

Provider attempt results are normalized to:

- ready;
- unavailable;
- unknown/transient;
- timeout;
- restricted;
- disabled;
- aborted.

Copyright restriction is terminal when the server plan indicates the episode/title is globally restricted.

Provider-specific restriction only skips that provider.

A missing episode is not counted as provider infrastructure failure.

A timeout/upstream error is treated as transient and eligible for fallback.

## 7. Runtime player fallback remains active

Source discovery and actual playback are separate layers.

Even after a source URL is discovered, AnimePlayer still owns runtime health:

- player ready timeout;
- source error;
- automatic switch to the next already-discovered source;
- resume position preservation;
- manual provider selection;
- local device health scoring.

The orchestrator must preserve enough fallback sources for AnimePlayer to recover after playback has started.

## 8. Episode identity guarantees

Every provider attempt must be scoped by:

- canonical AniList anime id;
- provider season;
- exact episode number;
- MAL/Shikimori id where required.

A source response is never published if it belongs to a stale route identity.

Changing episode invalidates the old discovery session and aborts all remaining attempts.

## 9. Copyright compatibility

The source orchestrator must preserve the 18.5.3.1 behavior:

- restricted episode never starts provider discovery;
- server provider endpoints remain protected;
- HTTP 451 remains supported;
- a stale browser cannot bypass an active restriction.

## 10. UX states

Source discovery exposes coherent states:

- “Подключаем лучший источник…”
- “Основной источник недоступен, пробуем резервный…”
- “Подготавливаем резервные источники…” only when useful;
- terminal “Источники просмотра временно недоступны.”

Do not expose internal provider stack traces or raw upstream errors to the user.

---

# 18.5.4.2 — Mobile + Resume Integrity

Planned after 18.5.4.1:

- fix mobile episode/translation controls;
- safe-area and landscape controls;
- Telegram Mini App fullscreen/background restore;
- source switch retains position;
- cross-device resume conflict resolution;
- completed state cannot regress;
- resume near end does not restart a completed episode;
- episode change cancels stale heartbeat/session state;
- one canonical progress writer.

---

# 18.5.4.3 — Playback Observability & Regression Matrix

Planned after 18.5.4.2:

- source-plan telemetry;
- time-to-first-playable-source;
- time-to-player-ready;
- provider attempt success/failure/timeout rates;
- fallback rate by provider;
- source exhausted rate;
- p95 startup by provider;
- System Health playback panel;
- automated regression matrix for normal episodes, long-form episodes, provider 5xx, provider timeout, missing episode, stale season, copyright restriction, resume, completion, fallback and autoskip.

---

# 18.5.4.1 release gates

The sub-patch is ready only when:

- source-policy exposes a deterministic health-aware plan;
- AnimeEpisodePage follows the plan instead of parallel normal-path fan-out;
- first playable source is published immediately;
- backup sources warm after primary success;
- each provider attempt has a timeout;
- discovery has a total time budget;
- stale episode requests cannot publish sources;
- copyright restrictions remain terminal;
- AnimePlayer runtime fallback still works;
- a dedicated 18.5.4.1 regression check passes;
- TypeScript, lint, existing playback checks and production build are green.
