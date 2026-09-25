# Patch 18.5.4.3 — Playback Observability & Regression Matrix Final

## Goal

Close Player Reliability Final with measurable production SLOs and a regression matrix that protects the complete playback path.

18.5.4.1 selects and warms providers.
18.5.4.2 protects mobile/resume/session ownership.
18.5.4.3 answers the operational question: **how reliably and how quickly does a user actually reach playable video?**

The patch must remain analytics fail-open. Telemetry loss may reduce visibility but can never prevent playback.

---

## 1. Playback journey telemetry

Instrument the full startup path with four discovery events:

- `player_discovery_plan`
- `player_discovery_attempt`
- `player_discovery_ready`
- `player_discovery_exhausted`

### Plan event

Emitted once per episode discovery lifecycle.

Metadata:

- strategy version;
- ordered providers;
- max attempts;
- discovery budget;
- whether policy came from server or client fallback;
- copyright-blocked/all-unavailable state.

Copyright-blocked playback is not counted as a provider failure.

### Attempt event

Emitted once per provider attempt, including background fallback warming.

Metadata:

- provider;
- phase: primary/warm;
- attempt index;
- attempt duration;
- configured timeout;
- normalized outcome;
- normalized reason.

Outcomes:

- ready;
- unavailable;
- timeout;
- restricted;
- aborted.

Route navigation cancellation is not interpreted as provider degradation.

### Ready event

Emitted once for the **first playable source**.

Metadata:

- provider;
- time-to-first-source;
- attempt count;
- strategy version.

### Exhausted event

Emitted once only when ordinary discovery cannot produce any source.

Metadata:

- elapsed discovery time;
- attempted provider count;
- final normalized reason;
- budget exhaustion flag.

---

## 2. Player-ready latency

`AnimePlayer` receives the discovery-start performance timestamp.

`player_source_ready` keeps its existing source-mount `startupMs` and additionally emits:

- `timeToPlayerReadyMs`: discovery start -> player ready.

This separates:

1. source discovery latency;
2. provider/player mount latency;
3. total end-to-end startup latency.

---

## 3. System Health playback SLO panel

System Health adds a 24-hour playback observability model:

Platform:

- discovery plans;
- provider attempts;
- first-source successes;
- exhausted discoveries;
- discovery success rate;
- p50/p95 time-to-first-source;
- p50/p95 source mount-to-ready;
- p50/p95 end-to-end time-to-player-ready;
- runtime source failures;
- auto fallback rate;
- exhaustion rate;
- resumes/completions.

Per provider:

- discovery attempts;
- discovery ready count;
- discovery timeout count;
- discovery unavailable count;
- discovery attempt p95;
- player-ready count;
- source-ready p95;
- end-to-end ready p95;
- runtime failures;
- automatic fallbacks from provider.

The panel is based on bounded recent product-event telemetry and never exposes user ids, media URLs or raw error payloads.

---

## 4. Playback health signals

Traffic-gated signals avoid false alerts on tiny samples.

When at least 20 discovery plans exist in 24 hours:

- critical: discovery exhaustion >= 10%;
- degraded: discovery exhaustion >= 3%, or p95 end-to-end startup >= 12s, or p95 first-source discovery >= 8s.

Fallback rate is displayed but is not independently treated as an outage because successful fallback is a resilience mechanism.

---

## 5. Final regression matrix

A dedicated `patch18-5-4-3:check` must protect the cross-layer invariants for:

- health-aware provider ordering;
- provider timeout;
- provider 5xx/unavailable normalization;
- source discovery budget;
- first-source publication;
- background fallback warming;
- ordinary exhausted path;
- copyright-blocked path distinct from exhausted;
- player mount timeout;
- runtime automatic fallback;
- source-switch resume;
- completed/near-end resume;
- long-form autoskip safety still present;
- mobile native selectors;
- stale watch-session generation shield;
- observability events and dashboard aggregation.

The check also executes pure playback telemetry aggregation scenarios so percentage/p50/p95/provider attribution cannot silently regress.

---

## 6. Privacy / storage

No new persistent user-identifying table is introduced.

Playback observability reuses existing `product_events`:

- no source URL is added to telemetry;
- provider names are normalized;
- timings are numeric and bounded;
- raw upstream error messages are not stored by the new discovery events.

---

## Release gates

Player Reliability Final is complete only when:

- 18.5.4.1 Source Orchestrator gate passes;
- 18.5.4.2 Mobile + Resume gate passes;
- 18.5.4.3 telemetry matrix passes;
- Watch Service passes;
- opening-skip safety passes;
- TypeScript passes;
- targeted lint passes;
- retention regression passes;
- production build passes.

After merge, the next major engineering phase is **18.5.5 — Scale Readiness 1K–10K**.
