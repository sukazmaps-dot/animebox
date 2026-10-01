# Patch 24.1 — Mood Intent Engine

## Goal

Make the Home mood selector a real short-term recommendation intent instead of a decorative genre bonus.

Patch 24 already belongs to the SEO Organic Growth Engine in the current repository, therefore this work is numbered **24.1** to avoid colliding with the production release history.

## Problem statement

The current Home flow has four related defects:

1. the UI changes the selected mood immediately while the Smart Feed can still be rendering recommendations ranked for the previous mood;
2. SmartRecommendationFeed resets its mood session before the new ranked candidate set is ready, so the later ranked result can be appended instead of atomically replacing the old mood session;
3. the mood rail is re-sorted behind the generic top-match rail by the session-stable rail order;
4. mood affinity is based mostly on broad genres, making Action/Romance/Comedy sufficient evidence for states where they should only be supporting signals.

## Phase A — Single mood contract

Create `lib/recommendation-moods.ts`.

It is the only source of truth for:

- public mood labels;
- picker hints and icons;
- primary/secondary genres;
- primary/secondary AniList tags;
- negative evidence;
- provider retrieval genres/tags;
- strict/relaxed thresholds.

The public modes remain:

- My taste / `any`;
- Comfort / `comfort`;
- Thriller / `tension`;
- Drama / `emotion`;
- Other worlds / `adventure`.

The same label must be used by the chip and the recommendation rail.

## Phase B — Mood evidence scorer

Create `lib/recommendation-mood-score.ts`.

The scorer must:

- normalize English and Russian genre names;
- read AniList tags already carried by Anime objects;
- give primary genre/tag evidence more weight than broad supporting genres;
- apply negative evidence;
- cap broad-only matches so Action, Romance, Comedy or Sci-Fi alone cannot become a strong mood match;
- return score, confidence, tier and matched evidence.

Tiers:

- strong;
- good;
- weak;
- none.

The mood rail uses strong/good candidates first and only relaxes after bounded candidate-page attempts.

## Phase C — Atomic mood switching

The selected chip and the mood used to render recommendations are separate states.

`mood`:
- reflects the user's latest click immediately.

`recommendationMood`:
- changes only in the same commit as the newly ranked recommendation set.

This prevents a feed labelled "Drama" from temporarily containing the old "Comfort" candidate set.

Explicit mood clicks bypass idle scheduling and trigger priority reranking.

Rapid sequences such as:

Comfort -> Thriller -> Drama -> Other worlds

must resolve to the last request only. Old network/ranking work is aborted or ignored by generation checks.

## Phase D — Mood-focused candidate retrieval

Add finite public `intent=mood` retrieval to `/api/recommendations`.

The intent contains no private user identifier and remains CDN-cacheable.

For active mood sessions, candidate source rotation prioritizes mood pools and alternates provider genre/tag targets. Taste genre, seasonal, hidden-gem and broad fallbacks remain available for diversity and resilience.

The first mood rerank bootstraps page 1 from the mood endpoint and merges it with the existing popular/ongoing pool before client personalization.

Smart Feed pagination continues with the same intent and isolates its page cache by intent.

## Phase E — Mood-first composition

When a mood is active:

1. mood rail;
2. top match;
3. session intent;
4. continuation / discovery / seasonal / other rails.

When mood is `any`, the mood rail does not exist and Top Match remains first.

The mood rail is ordered by a blended mood-first score rather than only the generic recommendation score.

Existing rail ownership remains sticky during ordinary pagination. Ownership is reset only for a genuine mood-session transition.

## Phase F — UX

The chip becomes active immediately.

While the replacement candidate set is being prepared:

- the picker exposes `aria-busy`;
- copy reports which mood is being prepared;
- the old feed remains stable;
- no page scroll is forced;
- after ranking completes the Smart Feed performs its existing bounded fade/atomic reset.

Reduced-motion users retain an immediate swap.

## Phase G — Regression shield

Add `npm run patch24-1:check` and include it in prebuild.

The check protects:

- central mood definitions;
- tag/negative evidence;
- broad-only score cap;
- selected/rendered mood separation;
- mood candidate bootstrap;
- strict rail matching;
- mood-first rail ordering;
- cache intent isolation;
- API intent routing;
- RecommendationPage contract.

## Non-goals

This patch does not rewrite Taste Graph, feedback policy, franchise intelligence, Watch Together, image delivery or SEO.

No Supabase migration is required.

## Acceptance criteria

- selecting a mood visibly changes the first recommendation rail;
- the first rail title uses the exact selected label;
- Action alone cannot strongly qualify as Thriller;
- Romance alone cannot strongly qualify as Drama;
- Comedy alone cannot strongly qualify as Comfort;
- a real primary genre/tag combination qualifies strongly;
- mood candidates use AniList tags when available;
- old async work cannot overwrite a newer mood selection;
- ordinary background refreshes remain append-only;
- cards do not reshuffle without a user mood action or explicit feedback rerank;
- infinite recommendation pagination continues to work;
- TypeScript/build/regression checks pass before merge.
