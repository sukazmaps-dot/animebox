# Patch 22 — Discovery & Recommendations 3.0

## 0. Product goal

Patch 22 turns AnimeBox recommendations from a strong hybrid sorter into a
full recommendation system whose primary objective is not CTR, but meaningful
watching.

The system must optimize for:

1. recommendation -> open;
2. open -> playback start;
3. playback start -> meaningful watch;
4. meaningful watch -> episode completion;
5. episode completion -> multi-episode continuation;
6. title completion / positive explicit feedback;
7. long-term discovery diversity without trapping the viewer in one genre.

The recommendation engine must remain explainable, bounded, cache-friendly and
safe for mobile runtime.

---

# 1. Non-negotiable architecture

The final pipeline is:

User history
  -> Taste Graph
  -> Recent taste / Session Intent
  -> Negative preferences
  -> Candidate generation
     - content affinity
     - AniList graph
     - franchise continuation
     - seasonal
     - hidden gems
     - collaborative/co-watch signal
     - controlled exploration
  -> Candidate scoring
     - taste match
     - completion probability
     - session intent
     - explicit feedback
     - freshness
     - novelty
     - sequel/franchise boost
     - availability
     - exposure fatigue
     - popularity correction
  -> Diversity / fatigue reranker
  -> Availability gate
  -> Explainable rails
  -> Exposure / watch telemetry
  -> Taste feedback loop

Candidate retrieval must stay public/cacheable where possible. User-specific
ranking stays client-side or behind bounded first-party server reads.

---

# 2. Core product principles

## 2.1 Meaningful watch > click

CTR is diagnostic, not the objective.

Primary quality metric:

recommendation impression
 -> click
 -> playback start
 -> >= 10/15 min active viewing
 -> episode completed
 -> second/third episode
 -> title completion

A recommendation that receives clicks but is abandoned immediately is weaker
than a recommendation with slightly lower CTR and high watch retention.

## 2.2 Long-term taste != current intent

The model separates:

- long-term taste;
- recent 7/30-day taste;
- current recommendation session;
- explicit mood selection;
- current viewing context.

A user who normally watches psychological thrillers can still want a short
comedy tonight. Session intent must influence ranking without permanently
rewriting long-term taste.

## 2.3 Negative signals have semantics

"Not interested" is not the same as:

- already watched;
- too long;
- do not like this genre;
- not now;
- do not like this setting.

Patch 22 must eventually persist structured negative reasons. "Not now" must
have a short decay and must not poison long-term taste.

## 2.4 Repetition is a ranking failure

If the same title is shown repeatedly without interaction, its score must
decay. The user should never feel that AnimeBox ignores repeated non-clicks.

## 2.5 Exploration is controlled

Recommendation slots are divided dynamically between:
- safe/exploitation;
- adjacent taste;
- exploration.

Exploration must preserve important taste characteristics instead of selecting
random unrelated titles.

## 2.6 Explanation must be evidence-based

Allowed recommendation explanations:
- because the user completes similar genres;
- because of a specific recent watched/favorite title;
- preferred studio;
- preferred length;
- current mood/session intent;
- sequel/franchise continuation;
- hidden gem with high taste compatibility.

Do not display invented certainty.

---

# 3. Patch 22 ranking model

## 3.1 Multi-objective score

Conceptual score:

final =
  taste_match
  + completed_affinity
  + studio_affinity
  + session_intent
  + completion_probability
  + explicit_positive_feedback
  + mood_affinity
  + sequel_boost
  + novelty
  + freshness
  + quality
  + exploration_adjustment
  - taste_negative
  - session_negative
  - exposure_fatigue
  - popularity_bias
  - duplicate_family
  - availability_penalty

Every material component must be bounded. No single weak signal may dominate
the whole model accidentally.

## 3.2 Versioning

Every ranking change that changes ordering materially increments:
- recommendation model version;
- algorithm version sent to product_events;
- analytics version breakdown.

Patch 22 starts at `22.0-v1`.

---

# 4. Phase A — Exposure / Fatigue Foundation

## Goal

Stop repeatedly presenting the same recommendation when the viewer has already
ignored it multiple times.

## Signals

Per anime:
- impressions in recent 7 days;
- impressions in recent 30 days;
- weighted impressions with recency decay;
- opens;
- dwell interactions;
- last impression timestamp;
- last open timestamp;
- last positive action timestamp.

## Fatigue policy

- first impression: no penalty;
- repeated unanswered impressions: increasing penalty;
- old impressions decay;
- a recent open materially reduces fatigue;
- positive actions clear/suppress fatigue;
- virtual-card remounts must not generate new impressions;
- fatigue calculation must be O(events + candidates), not
  O(events * candidates).

## Runtime

Build one exposure map from the bounded local recommendation event history,
then score every candidate by map lookup.

No new network request is allowed for client fatigue ranking.

## Telemetry

Recommendation impression telemetry includes:
- exposure count 7d;
- exposure count 30d;
- computed fatigue;
- current algorithm version.

This lets admin analytics correlate repetition with CTR/watch conversion.

---

# 5. Phase B — Session Intent

## Goal

Model what the viewer appears to want now without overwriting long-term taste.

## Inputs

- current explicit mood;
- titles opened in current recommendation session;
- recent recommendation positive/negative actions;
- latest watched titles;
- recent session duration pattern;
- preferred episode count;
- completed vs ongoing preference.

## Session vector

Bounded fields:
- genre weights;
- short/long preference;
- finished/ongoing preference;
- comfort/tension/emotion/adventure weights;
- exploration appetite;
- session confidence.

## Decay

Session intent lives for the current session / short window. It does not become
a permanent Taste Graph update unless later confirmed by meaningful watching.

---

# 6. Phase C — Completion Probability

## Goal

Estimate whether this viewer is likely to meaningfully continue the title.

Initial heuristic model uses:
- genre completion affinity;
- completed-title similarity;
- episode count fit;
- finished/ongoing preference;
- user completion rate;
- binge score;
- rating / explicit feedback compatibility.

Output: bounded 0..1 probability-like score.

It is not displayed as a literal probability until calibrated against real
outcomes.

Later analytics compares score buckets with:
- start rate;
- 15m rate;
- episode completion;
- multi-episode continuation.

---

# 7. Phase D — Taste Graph 7

Expand Taste Graph beyond genre-only preference.

Target dimensions:
- positive/negative genres;
- completed genres;
- studios;
- episode-count preference;
- format;
- era/year buckets;
- finished vs ongoing;
- completion rate;
- binge score;
- ratings;
- explicit feedback;
- mood vector;
- exploration appetite.

Where reliable metadata exists, add:
- themes/tags;
- demographic;
- setting/tone proxy.

All fields require sanitization, caps and confidence.

---

# 8. Phase E — Franchise Intelligence

## Requirements

- suppress duplicate seasons in generic rails;
- recognize sequel/related-title opportunities;
- do not recommend S2 as a generic discovery candidate when S1 is required and
  unwatched;
- prioritize next season after completion of the previous season;
- create "История продолжается" rail.

Franchise continuation is intentionally exempt from some family-diversity
penalties because it is a different user intent than discovery.

---

# 9. Phase F — Controlled Exploration / Hidden Gems

Dynamic slot mix based on taste confidence.

Cold start example:
- safe 50%;
- adjacent 30%;
- exploration 20%.

High-confidence profile example:
- safe 75%;
- adjacent 20%;
- exploration 5%.

Hidden-gem candidate:
- sufficient taste affinity;
- not already exposed excessively;
- lower popularity;
- acceptable community quality;
- availability verified.

Popularity must not dominate recommendation quality.

---

# 10. Phase G — Fresh / Seasonal discovery

New titles lack behavioral history, so they receive a controlled freshness
boost multiplied by taste compatibility.

Never use unconditional "new = high score".

Target rail:
"Из этого сезона для тебя".

---

# 11. Phase H — Feedback 2.0

Replace one ambiguous negative action with structured reasons:

- not_interested;
- less_like_this;
- already_watched;
- too_long;
- dislike_genre;
- dislike_setting;
- not_now.

"not_now":
- hides in current/short-term sessions;
- decays quickly;
- does not create a strong negative genre weight.

"dislike_genre":
- stronger long-term negative signal.

---

# 12. Phase I — Explainability 2.0

Reason generation uses scored evidence.

Examples:
- "Потому что тебе понравился …"
- "Ты часто досматриваешь психологические триллеры"
- "Похожая длина — около 12 серий"
- "Продолжение тайтла, который ты завершил"
- "За пределами привычного: другой жанр с твоим любимым темпом"
- "Скрытая находка: высокий матч, но менее популярный тайтл"

Reason must correspond to the actual ranking component.

---

# 13. Phase J — Diversity Reranker 3.0

Constraints:
- franchise concentration;
- genre concentration;
- studio repetition;
- format repetition;
- era repetition;
- source repetition;
- popularity concentration.

Reranking is performed after relevance scoring.

Never sacrifice all relevance merely to satisfy diversity.

---

# 14. Phase K — Recommendation analytics 3.0

Metrics:
- impression -> click;
- click -> playback;
- click -> 15m;
- playback -> 15m;
- playback -> completion;
- recommendation -> multi-episode continuation;
- dismiss rate;
- fatigue bucket performance;
- match-score calibration;
- completion-score calibration;
- exploration conversion;
- hidden-gem conversion;
- diversity metrics;
- repeated-impression rate.

Breakdowns:
- algorithm version;
- rail;
- source;
- position;
- taste confidence bucket;
- fatigue bucket;
- exploration/safe class.

---

# 15. Phase L — Home composition

Target personalized Home order:

Hero
-> Continue Watching
-> Top Match / Для тебя
-> Current-session intent rail
-> Schedule
-> Story continues
-> Hidden gems
-> Outside your usual taste
-> Seasonal for you
-> Community

The exact order may adapt by user state.

---

# 16. Performance budgets

- no recommendation model in Hero critical bundle;
- heavy ranking stays deferred/idle;
- no per-card network ranking calls;
- exposure map computed once per ranking invocation;
- candidate pagination stays public/cacheable;
- long rails stay virtualized;
- no full Taste Graph refresh after every impression;
- feedback reranking operates on already loaded candidates first.

---

# 17. Privacy / data policy

Recommendation telemetry uses first-party AnimeBox product events.

Do not derive or store:
- sensitive personal categories;
- exact location;
- external browsing history;
- third-party advertising profile.

Session intent is based only on AnimeBox product activity.

---

# 18. Regression matrix

1. cold-start guest;
2. authenticated user with 1 watched title;
3. high-confidence 100+ title history;
4. repeated impression without click;
5. repeated impression with recent click;
6. positive feedback;
7. dismiss;
8. already watched;
9. mood switch;
10. session reset;
11. 12-episode preference;
12. long-form preference;
13. ongoing-heavy viewer;
14. finished-only viewer;
15. same franchise candidates;
16. hidden-gem candidate;
17. seasonal candidate;
18. candidate with no metadata;
19. sparse candidate page;
20. infinite rail pagination;
21. virtual remount;
22. anonymous/local-only mode;
23. signed-in Taste Graph mode;
24. availability-filtered candidate;
25. mobile low-memory runtime.

---

# 19. Release phases

A. Exposure / fatigue foundation.
B. Session intent.
C. Completion score.
D. Taste Graph 7.
E. Franchise intelligence.
F. Exploration + hidden gems.
G. Seasonal freshness.
H. Structured feedback.
I. Explainability.
J. Diversity reranker.
K. Analytics 3.0.
L. Home composition + final UX.
M. Full production hardening.

---

# 20. Definition of Done

Patch 22 is complete when:

- repeated ignored cards measurably decay;
- recommendation version is fully attributable;
- session intent cannot permanently poison long-term taste;
- completion-oriented ranking is present;
- sequel/franchise ordering is safe;
- exploration is bounded and measurable;
- recommendation reasons are evidence-based;
- candidate retrieval remains cacheable;
- no N+1 recommendation API pattern exists;
- infinite rails remain stable;
- all recommendation regression gates pass;
- production build passes;
- admin analytics can compare recommendation quality by algorithm version.


---

## 21. Current implementation status

### Phase A — Exposure / Fatigue Foundation
Status: **implemented / under CI**

Implemented:
- `22.0-v1` recommendation model/version attribution;
- bounded 30-day exposure model;
- 7-day and 30-day impression counters;
- six-day half-life recency decay;
- first impression is free from fatigue;
- repeated unanswered impressions create a bounded ranking penalty;
- recent opens reduce fatigue;
- positive actions clear fatigue;
- exposure map is built once per ranking invocation;
- fatigue diagnostics are propagated into recommendation events;
- runtime regression matrix added to `patch22:check`.

### Phase B — Session Intent
Status: **implemented foundation / under CI**

Implemented:
- 72-hour recent-watch session window;
- 18-hour half-life;
- maximum eight recent titles;
- bounded recent genre vector;
- recent preferred episode-count estimate;
- ongoing-vs-finished preference;
- session confidence;
- per-candidate session-intent affinity;
- separate versioned ranking component;
- evidence-based "Похоже на то, что ты смотришь сейчас" explanation;
- telemetry for session-intent score/confidence;
- runtime regression matrix.

### Phase C — Completion-oriented ranking
Status: **implemented foundation / under CI**

Implemented:
- bounded continuation/completion heuristic score;
- completed-affinity, taste-fit, length-fit, community quality,
  user completion, binge-fit and finished-title inputs;
- long-title and negative-taste penalties;
- separate `completionLikelihood` ranking component;
- completion score attribution in recommendation telemetry;
- calibration intentionally deferred until production outcome data is available;
- runtime regression matrix.

### Phase D — Taste Graph 7
Status: **implemented / under CI**

Implemented:
- Taste Graph cache/version bump to `taste-v7`;
- persistent catalog recommendation metadata: studios, format, release year;
- one-time `recommendation_metadata_version` enrichment marker;
- legacy catalog rows lazily enrich on the next normal `ensureAnime()` refresh;
- no mass provider backfill and no recommendation-time N+1 provider requests;
- long-term positive/negative studio vectors;
- long-term positive/negative format vectors;
- long-term positive/negative era/decade vectors;
- finished-vs-ongoing preference;
- metadata coverage counters so missing provider metadata is distinguishable from preference;
- studio / format / era / finished affinities in the client ranker;
- bounded negative metadata affinity;
- evidence-based studio / format / era recommendation reasons;
- Taste Graph 7 runtime regression matrix added to `patch22:check`.

Notes:
- existing catalog rows start at metadata version 0 and are enriched lazily;
- legitimate empty studio metadata is not refreshed forever because the version
  marker records that enrichment was attempted;
- Taste Graph construction reads metadata in the existing batched
  `anime_catalog` query only.

### Phase E — Franchise Intelligence
Status: **implemented foundation / under CI**

Implemented:
- client-safe franchise family normalization for Russian/English/Romaji titles;
- explicit season/part prerequisite gate for generic discovery;
- exact-next-season continuation detection from bounded local watch history;
- split-cour / Part 2 continuation handling;
- one-family dedupe before the global diversity pass;
- diversity reranker consumes the same canonical franchise key and never counts a continuation as an exploration slot;
- continuation candidates win family dedupe over generic franchise entries;
- bounded `franchiseContinuation` ranking component;
- evidence-based continuation reason;
- franchise continuation/season attribution in recommendation product telemetry;
- dedicated `История продолжается` rail that claims continuation candidates before generic rails;
- recommendation algorithm/ranking version bumped to `22.1-v1`;
- dedicated Phase E runtime regression matrix added to `patch22:check`.

Notes:
- Phase E intentionally adds no per-card provider requests;
- public candidate caching stays unchanged;
- the existing AniList franchise resolver remains available for detail-page franchise navigation;
- candidate-side gating uses metadata already present in the recommendation payload.

### Phase F — Exploration + Hidden Gems
Status: **planned**

### Phase G — Seasonal Freshness
Status: **planned**

### Phase H — Structured Feedback 2.0
Status: **planned**

### Phase I — Explainability 2.0
Status: **planned**

### Phase J — Diversity Reranker 3.0
Status: **planned**

### Phase K — Analytics 3.0
Status: **planned**

### Phase L — Personalized Home Composition
Status: **planned**

### Phase M — Production hardening
Status: **planned**
