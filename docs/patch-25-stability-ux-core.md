# AnimeBox Patch 25 — Stability & UX Core

## Status

In progress on `patch-25-stability-ux-core`.

Patch 25 is a reliability patch, not a feature expansion. Its job is to make the current AnimeBox product feel deterministic: clicks must select what the user clicked, async sections must not move the viewport, search must react immediately, recommendation rails must not reshuffle while being viewed, and loading states must reserve stable space.

The patch starts from the current production line after Patch 24.3. It preserves the already shipped Mood Intent Engine, Instant Search, search observability, Patch 23 rail pagination work, and Patch 22 recommendation intelligence.

---

## Product goals

1. No unexpected document scrolling after opening an anime or after streamed/async sections mount.
2. Mood selection is atomic from the user's point of view.
3. Search input never waits for network work before reflecting typed text.
4. Only the newest search/recommendation request may publish authoritative state.
5. Recommendation rails remain visually stable while the user is reading or scrolling them.
6. Empty/sparse rows recover without replacing already rendered cards.
7. Loading and hydration do not cause noticeable layout jumps.
8. Every regression fixed by this patch receives a static or runtime contract check.

---

## Non-goals

- No recommendation-algorithm rewrite.
- No new provider or player source.
- No large visual redesign.
- No database migration unless later profiling proves one is required.
- No removal of Patch 24 search telemetry.
- No downgrade of image quality to hide performance issues.

---

# Phase A — Scroll containment and route stability

## A1. Eliminate implicit document-level scrolling

Audit every automatic `scrollIntoView()`, `focus()`, hash navigation side effect, and mount-time scroll adjustment used by anime pages and shared navigation components.

Automatic positioning must follow this rule:

- horizontal component -> change only its own `scrollLeft`;
- vertical picker/list -> change only its own `scrollTop`;
- document scrolling is allowed only after an explicit user navigation action;
- focus after opening a dialog must use `preventScroll: true`.

### Confirmed root cause

`AnimeFranchise` is a streamed lower-page section. Its `HorizontalNavRail` auto-centers the current franchise item after mount. The old implementation used `active.scrollIntoView()`. That API is allowed to move ancestor scrolling boxes including the document viewport, so a late franchise render could pull the user down the anime page.

### Implementation

`HorizontalNavRail` now:

- reads active and track rectangles;
- calculates only the horizontal centering delta;
- clamps the target to `0..scrollWidth-clientWidth`;
- uses `track.scrollTo({ left })`;
- never calls `active.scrollIntoView()`.

`EpisodeQuickSelector` now:

- owns a `gridRef`;
- checks whether the current episode is outside the grid viewport;
- adjusts only `grid.scrollTop`;
- focuses the current episode with `preventScroll: true`;
- keeps the explicit "Все серии" document navigation as a user-triggered action.

### Acceptance criteria

- Opening a new anime at scroll position 0 keeps the page at the top while franchise data arrives.
- A franchise with current season outside the horizontal viewport centers horizontally without vertical movement.
- Opening the quick episode selector reveals the current episode without moving the anime page.
- Browser back/forward remains unaffected.
- Intentional clicks on "Все серии" may still scroll to `#episode-browser`.

---

# Phase B — Atomic Mood Picker state

## B1. Separate optimistic selection, persisted preference, and rendered recommendation mood

Patch 24.1 already separates:

- `mood`: immediately selected UI mood;
- `recommendationMood`: mood for which the currently visible ranked feed was actually generated.

Patch 25 adds ownership for persistence.

### Failure mode

The UI can optimistically execute `setMood(nextMood)` before the dynamically imported personalization module persists the new mood. During that interval, another `animebox-taste-changed` or `animebox-taste-graph-updated` refresh can read the older localStorage mood and visually restore it.

### Implementation contract

The runtime owns:

- `moodRef` — latest user-visible selection;
- `moodPersistenceSequenceRef` — monotonic write ownership;
- `pendingMoodRef` — currently pending mood + sequence.

Rules:

1. A click synchronously claims a new persistence sequence.
2. The selected mood changes immediately.
3. Previous recommendation requests are aborted.
4. Taste refreshes cannot replace a pending selection with an older persisted value.
5. Only the latest persistence sequence may call `setTasteMood`.
6. Once storage reports the same mood, pending state is cleared.
7. The recommendation feed still switches from `recommendationMood` only after ranking for the selected mood completes.

### Acceptance criteria

- Rapidly click Comfort -> Tension -> Adventure: Adventure stays selected.
- A taste-graph update during switching cannot flash the previous mood.
- Old async rank requests cannot publish after the newest mood.
- Visible cards never claim the new mood while still showing a previous-mood ranking.
- Reload restores the final persisted mood.

---

# Phase C — Search interaction hardening

Patch 24.2/24.3 already provide a 90 ms authoritative debounce, local-first instant results, cancellation and latency telemetry. Patch 25 must preserve those contracts while removing residual interaction work from the input path.

## C1. Input lane

The input event may only:

- update `liveQuery`;
- update the live ref;
- start timing once per normalized query;
- render instant local suggestions/results where available.

It must not synchronously execute:

- provider calls;
- expensive taxonomy passes;
- full discovery ranking;
- URL serialization;
- large result merges.

## C2. Request ownership

All authoritative async search lanes must carry request identity.

A response may publish only when:

- its AbortSignal is not aborted;
- its sequence equals the latest sequence;
- its normalized query still equals the current authoritative query.

## C3. Result continuity

When authoritative enrichment arrives:

- useful instant results should not disappear into an empty state;
- result replacement must correspond to the same normalized query;
- pagination always belongs to the current query;
- load-more from query A must never append into query B.

## C4. URL/history

Typing uses replace semantics after debounce. Explicit filter actions may use push semantics when they represent a navigable state. Popstate restoration must not cause an extra stale request to overwrite restored state.

### Acceptance criteria

- Keystrokes remain visually immediate on low-end mobile.
- Old responses cannot overwrite newer text.
- Empty-state text belongs only to the current query.
- Search telemetry still measures latency starting from the live input event.
- Patch 24.2 and Patch 24.3 checks continue to pass.

---

# Phase D — Recommendation rail determinism

Patch 23 made pagination append-only. Patch 25 treats rendered cards as a UI contract.

## D1. Stable identity

- React keys use persistent anime/recommendation identity, never array index.
- Existing cards do not receive new positions because another rail fetched a page.
- A refresh caused by taste/history change starts a clearly new recommendation session rather than mutating the visible session in place.

## D2. Append-only pagination

For a given session + rail:

- page N+1 may append unseen IDs;
- it cannot reorder IDs already visible;
- duplicate IDs are removed before state publication;
- empty page recovery may search another source/page but cannot clear the existing rail.

## D3. Sparse row recovery

A row below its minimum useful density may bootstrap a bounded number of candidate pages. Recovery stops when:

- minimum density is reached;
- the page-hop budget is exhausted;
- the server explicitly reports no continuation.

Never create an infinite request loop for an empty category.

## D4. Scroll-triggered loading

Horizontal scrolling may trigger prefetch/load-more, but loading must not look like recommendation regeneration.

- rendered prefix is immutable;
- skeletons appear only for appended capacity;
- current scrollLeft is preserved;
- media warmup does not modify recommendation state.

### Acceptance criteria

- Cards do not change while the user is idle.
- Scrolling right never replaces previously visible cards.
- A row cannot oscillate between two candidate sets.
- Empty rows either recover or end in a stable intentional empty state.

---

# Phase E — Layout, hydration and loading stability

## E1. Space reservation

Every async home/anime section must have a predictable minimum geometry or skeleton matching final density.

Priority surfaces:

- recommendation feed;
- continue watching;
- franchise rail;
- episode browser;
- search result grid;
- image/card media boxes.

## E2. Images

- poster/card aspect ratio is reserved before decode;
- responsive sizes remain accurate;
- low-resolution placeholders must not remain after the full candidate is available;
- image fallback must not change card dimensions.

## E3. Hydration

Client-only runtime sections may replace their skeleton but must not cause an avoidable document-height collapse/expansion.

### Acceptance criteria

- no obvious page jump after hydration;
- no poster container grows after image decode;
- streamed franchise rendering does not move viewport;
- recommendation skeleton and final rail have compatible dimensions.

---

# Phase F — Failure containment

Async optional features must fail locally.

- Recommendation failure -> stable fallback/empty personalized surface, not home crash.
- Taste graph failure -> current preference remains usable.
- Search enrichment failure -> instant/local results remain usable when present.
- Franchise failure -> anime page remains usable.
- Image/provider failure -> bounded fallback, no retry storm.

Every aborted request is treated as normal control flow rather than a user-facing error.

---

# Phase G — Regression and release gates

Patch 25 owns `scripts/patch-25-stability-ux-check.mjs`.

The gate protects:

- no `active.scrollIntoView()` in HorizontalNavRail;
- internal-only quick-selector auto-positioning;
- `preventScroll` focus;
- pending mood ownership;
- monotonic mood persistence sequence;
- selected-vs-rendered mood separation;
- Patch 24 instant-search primitives;
- search request sequence ownership;
- stable recommendation feed safeguards.

Before merge, run:

```bash
npm run patch25:check
npm run patch24-1:check
npm run patch24-2:check
npm run patch24-3:check
npm run patch23:check
npm run episode-identity:check
npx tsc --noEmit
npm run build
```

If a legacy static check conflicts with a safer implementation, update the check only when the new invariant is at least as strict; never remove a gate just to make CI green.

---

# Manual QA matrix

## Anime page

- fresh anime, cold cache;
- previously visited anime;
- anime with multi-season franchise;
- anime with no franchise;
- long franchise requiring horizontal centering;
- mobile 360/390/430 CSS px;
- desktop 1366/1440/1920;
- navigate anime A -> anime B -> back.

Observe `window.scrollY` before and after streamed sections settle.

## Mood picker

For each sequence below, verify selected chip and visible feed:

- Any -> Comfort;
- Comfort -> Tension;
- Tension -> Emotion -> Adventure quickly;
- selection while taste graph refresh event fires;
- selection followed by immediate route navigation/back;
- reload after final selection.

## Search

- one character;
- two characters;
- fast 10+ character typing;
- Cyrillic;
- Latin/romaji;
- typo/fuzzy query;
- query A immediately replaced by B;
- filter change while request is in flight;
- paginate then change query;
- browser back/forward.

## Recommendation rails

- no interaction for 30 seconds;
- slow horizontal scroll;
- rapid horizontal scroll;
- hit end of rail repeatedly;
- background tab -> foreground;
- mood change while a rail page is loading;
- history/progress change while Home is open.

---

# Telemetry / diagnostics

Patch 25 should use existing telemetry before adding new event families.

Useful measurements:

- unexpected scroll delta after route mount;
- search first-result p50/p95;
- search enrichment delta;
- aborted vs published search requests;
- mood switch start-to-ranked latency;
- rail append count and empty-page recovery count.

Diagnostic data must not include raw private viewing data beyond the existing analytics contracts.

---

# Rollout

1. Merge only after Patch 25 + 23/24 regression gates pass.
2. Deploy preview and perform cold-cache mobile QA.
3. Verify search dashboard after preview traffic.
4. Verify anime page scroll position on multi-season titles.
5. Production deploy only after build/typecheck success.
6. Watch client errors, search latency, recommendation API latency and image failures after release.

---

# Current implementation progress

Completed in the first Patch 25 pass:

- created branch `patch-25-stability-ux-core`;
- replaced HorizontalNavRail document-level active centering with container-only horizontal scrolling;
- replaced EpisodeQuickSelector automatic current-episode positioning with grid-only vertical scrolling;
- added mood persistence ownership and stale-refresh protection;
- added Patch 25 static regression gate.

Next implementation slices are Search interaction hardening, recommendation-session/rail audit, and layout-shift audit.
