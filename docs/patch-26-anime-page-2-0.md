# AnimeBox Patch 26 — Anime Page 2.0

## Goal

Patch 26 turns the anime detail route from a static information page with an episode grid into a continuation surface.

The page must answer four user questions immediately:

1. What title am I looking at?
2. Where did I stop?
3. Which season/part comes before and after this one?
4. Can I watch this title right now, and what should I do when provider data is incomplete?

Patch 26 builds on Patch 25 and must preserve its scroll-containment guarantees.

---

## Phase A — Continue Watching on anime detail

### Problem

AnimeBox already had strong continuation logic on Home and in the tracker, but the anime page itself forced a returning viewer to rediscover the correct episode.

### Contract

The anime detail page receives a dedicated client surface that combines:

- local crash-resume state from `lib/watch-progress.ts`;
- authenticated server state from the exact `/api/watch/title/[animeId]` endpoint;
- freshness ownership using timestamps;
- existing continue-watching attribution and product analytics.

### Freshness rule

If both local and server continuation exist:

- the newer state wins;
- server state wins ties;
- a newer completed/no-resume server state suppresses stale local crash-resume;
- a genuinely newer valid local crash-resume may supersede an older server tombstone;
- server lookup is scoped to the current anime ID and never depends on the title being inside a recent-N list;
- unusable local positions near the beginning/end are ignored by the existing resume-integrity policy.

### Live refresh

Server resume snapshots are scoped to the authenticated `ownerId`. During auth resolution the CTA stays hidden, so guest or previous-account progress cannot flash across an identity transition.

The surface refreshes on:

- `watch-progress`;
- `watch-state-updated`;
- `focus`;
- `pageshow`;
- returning the document to visible state.

No page reload is required.

### UX

The compact card displays:

- “Продолжить просмотр” or “Следующая серия”;
- episode number;
- resume time when meaningful;
- current-episode progress bar;
- one direct “Смотреть →” action.

The link opens the canonical AnimeBox watch route with `?ep=`.

---

## Phase B — Franchise previous/current/next navigation

### Problem

The horizontal franchise rail shows order, but for a long franchise the user still has to visually find the adjacent part.

### Contract

For the primary season line:

- resolve current season index;
- expose previous season when one exists;
- expose next season when one exists;
- never manufacture navigation across movies/OVA/spin-offs;
- keep the existing full horizontal rail below the shortcuts.

The current item remains non-clickable and retains `aria-current="page"`.

### Title fallback inside franchise

Display order:

1. Russian title;
2. explicit current page title for current item;
3. English;
4. Romaji;
5. Native;
6. “Без названия”.

The navigation must remain useful when Shikimori localization is temporarily missing.

---

## Phase C — Detail display fallback

Anime localization already performs:

- local persisted RU cache;
- Shikimori RU enrichment;
- original AniList data as fallback.

Patch 26 does not duplicate that pipeline.

Instead the page creates a normalized display layer:

- `displayTitle`;
- `originalTitle`;
- cleaned `displayDescription`;
- `pageHeading` with a safe title fallback.

### Empty description

A missing provider description must not remove the entire information block.

The page renders a neutral message that says description is not yet available while seasons and episode information remain usable.

This is a UI fallback, not generated anime metadata.

---

## Phase D — Provider / episode state

Existing EpisodeList states remain authoritative:

- checking availability;
- source unknown;
- unavailable;
- no episode information;
- available.

Patch 26 must not create links to unconfirmed episodes.

No optimistic episode URLs may bypass `anime_availability` / trusted watch-service rules.

---

## Phase E — Analytics

The existing continue-watching attribution API is extended with an optional `source`.

Home remains backward-compatible and defaults to:

`home_continue`

Anime detail writes:

`anime_detail_continue`

The later player-start event restores the stored source so attribution does not incorrectly classify anime-page continuation as Home continuation.

---

## Phase F — Regression protection

Patch 26 owns:

`scripts/patch-26-anime-page-check.mjs`

The gate protects:

- anime detail resume surface;
- local + server continuation reconciliation;
- freshness ownership;
- live progress refresh;
- source-aware continuation attribution;
- normalized detail title/description fallback;
- previous/next franchise navigation;
- franchise title fallback.

Before merge:

```bash
npm run patch26:check
npm run patch25:check
npm run episode-identity:check
npm run watch-service:check
npm run patch21:check
npx tsc --noEmit
npm run build
```

---

## Manual QA matrix

### Continue Watching

Test:

- guest with local partial episode;
- signed-in user with server resume;
- local progress newer than server;
- server progress newer than local;
- next-episode state at 0 seconds;
- completed title;
- resume near episode ending;
- playback update followed by browser back.

Expected:

- only one continuation CTA;
- correct episode;
- no stale CTA after completion;
- no full page refresh;
- correct analytics source.

### Franchise

Test:

- first season;
- middle season;
- final season;
- two-season franchise;
- long franchise;
- title with no RU franchise localization;
- partial franchise API response.

Expected:

- first season shows only Next;
- middle shows Previous + Next;
- last shows only Previous;
- full rail remains available;
- no document auto-scroll regression from Patch 25.

### Display fallback

Test:

- RU title + RU description;
- no RU title;
- no RU description;
- local-catalog-only title while AniList is degraded;
- missing poster/banner.

Expected:

- page remains routable;
- heading never becomes blank;
- description area never collapses into unexplained empty space;
- no fake translated description is generated.

---

## Current implementation

Implemented in the first Patch 26 slice:

- branch `patch-26-anime-page-2-0`;
- `AnimeDetailContinueWatching`;
- local/server resume freshness reconciliation;
- source-aware continue attribution;
- previous/next primary-franchise shortcuts;
- franchise display fallback;
- anime detail display title/original-title/description fallback;
- Patch 26 regression gate.

Next slices:

1. run full CI and resolve legacy gate conflicts;
2. review episode/provider UX for redundant states;
3. add focused responsive polish only where QA demonstrates a real issue;
4. preview/cold-cache validation;
5. merge and deploy after all gates pass.
