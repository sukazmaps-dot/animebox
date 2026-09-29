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

Status: **implemented / CI green**

Dynamic slot mix based on taste confidence.

Implemented mix policy:
- cold start: safe 50%, adjacent 30%, exploration 20%;
- high-confidence profile: safe 75%, adjacent 20%, exploration 5%;
- intermediate confidence interpolates between those bounds;
- Taste Graph exploration appetite is blended with confidence instead of acting
  as an unbounded direct quota.

Candidate classification:
- `safe`: strong known taste match or franchise continuation;
- `adjacent`: at least one familiar taste axis with meaningful novelty;
- `explore`: lower direct taste overlap but acceptable quality and low
  negative affinity.

Hidden-gem qualification:
- sufficient positive taste affinity;
- community quality floor;
- low negative affinity;
- low exposure fatigue;
- lower/mid popularity band;
- blockbuster titles are explicitly excluded from hidden-gem status;
- popularity is log-scaled so audience size cannot dominate relevance.

Candidate generation:
- public/cacheable `hidden_gem` candidate source added;
- source uses bounded deeper high-score AniList pages;
- no user/session identifier enters the public recommendation endpoint;
- final hidden-gem qualification remains client-side.

Ranking:
- model/algorithm version: `22.2-v1`;
- bounded novelty component;
- bounded hidden-gem component;
- bounded popularity-bias penalty;
- franchise continuation is excluded from exploration accounting.

Presentation:
- dedicated `Скрытые находки` rail;
- `За пределами привычного` uses explicit exploration classification;
- hidden-gem candidates are reserved before generic Top Match ownership;
- existing sticky rail ownership / virtualization remains unchanged.

Telemetry:
- exploration class;
- novelty score;
- hidden-gem score;
- popularity band;
- all fields flow through impression/open/dwell/feedback attribution.

Regression coverage:
- exact 50/30/20 cold-start policy;
- exact 75/20/5 high-confidence policy;
- hidden-gem quality floor;
- blockbuster exclusion / popularity correction;
- franchise continuation exclusion;
- candidate source/cache contract;
- rail and telemetry contracts.

Popularity must not dominate recommendation quality.

---

# 10. Phase G — Fresh / Seasonal discovery

Status: **implemented / CI green**

Goal:
surface strong current-season titles without turning freshness into a global
ranking shortcut.

Seasonality model:
- current anime season is derived from the shared catalog season helper;
- candidate season is derived from AniList `startDate`;
- relations are `current`, `previous`, `recent`, `older`, `unknown`;
- current-season freshness decays inside the season instead of acting as a
  constant bonus;
- previous-season titles keep only a small decayed tail;
- older catalogue titles receive no seasonal freshness bonus.

Taste gate:
- freshness never scores by itself;
- a title must pass a minimum taste-compatibility threshold;
- final seasonal score is freshness × normalized taste compatibility;
- explicit negative affinity reduces the score;
- repeated-exposure fatigue reduces the score;
- popularity is not part of seasonal eligibility.

Candidate generation:
- public/cacheable `seasonal` source added;
- current `season + year` are explicit inputs to the shared candidate cache;
- no user/session identifier enters the public candidate cache key;
- source rotates with ranked / popularity / mood / hidden-gem / ongoing pools;
- availability filtering remains mandatory after retrieval.

Ranking:
- model/algorithm version: `22.3-v1`;
- bounded `seasonalFreshness` component;
- seasonal freshness is intentionally excluded from the displayed taste-match
  percentage so "new" cannot fake a stronger personal match;
- generic relevance, completion, negative signals, exposure fatigue and
  franchise logic remain intact.

Presentation:
- dedicated `Из этого сезона для тебя` rail;
- rail requires current-season relation plus a minimum personalized seasonal
  score;
- seasonal cards are reserved before generic Top Match ownership;
- sticky rail ownership and bounded DOM virtualization are preserved.

Explainability:
- evidence-based reason:
  `Из текущего сезона — совпадает с твоим вкусом`;
- reason is emitted only when the same seasonal score that affected ranking
  crosses the configured threshold.

Telemetry:
- seasonal score;
- raw freshness score;
- season relation;
- season;
- season year;
- fields flow through impression/open/dwell/feedback attribution.

Regression coverage:
- strong current-season taste match receives a bounded boost;
- zero taste compatibility receives exactly zero seasonal boost;
- previous season decays below current season;
- older catalogue titles receive no seasonal boost;
- negative affinity and fatigue damp freshness;
- seasonal candidate source/cache contract;
- rail threshold and telemetry contract.

Never use unconditional `new = high score`.

---

# 11. Phase H — Structured Feedback 2.0

Status: **implemented / CI green**

Goal:
replace the single ambiguous negative action with explicit reasons that have
different scope, strength, decay and ranking effects.

Feedback policy:
- `like_more`: positive explicit preference;
- `not_interested`: permanent title exclusion plus a moderate broad negative
  signal;
- `less_like_this`: weaker broad negative signal;
- `already_watched`: permanent title exclusion with **zero negative taste
  penalty**;
- `too_long`: title exclusion plus an episode-count aversion signal, without
  punishing genres or studios;
- `dislike_genre`: strong long-term genre-only negative signal;
- `dislike_setting`: studio/format/era/status proxy for visual/context style,
  without a strong genre penalty;
- `not_now`: 14-day temporary snooze with a very small short-term engagement
  penalty and no long-term taste damage;
- `hidden`: backwards-compatible legacy strong-hide signal.

Policy/version contract:
- recommendation model/algorithm version: `22.4-v1`;
- feedback policy version: `22.4-feedback-v2`;
- one shared policy module is consumed by client ranking and server Taste Graph;
- the previous one-row-per-user/title feedback storage contract is preserved.

Persistent data:
- `recommendation_feedback.signal` accepts the new structured reasons;
- a user/signal/updated index supports future Phase K breakdowns;
- feedback policy version is written into bounded metadata;
- latest feedback for a title remains the source of truth.

Temporary snooze:
- `not_now` is stored locally with an expiry timestamp;
- local ranking filters active snoozes immediately;
- server Taste Graph excludes `not_now` only while its 14-day window is active;
- once expired, it no longer blocks that title;
- `not_now` does not alter long-term genre weights.

Taste Graph:
- feedback processing is axis-aware instead of applying one weight to every
  metadata dimension;
- genre, studio, format, era and finished/ongoing status can now receive
  independent positive/negative weights;
- `dislike_genre` affects genre vectors only;
- `dislike_setting` affects studio/format/era/status axes;
- `already_watched` only excludes the exact title;
- every signal has its own half-life and minimum decay floor;
- successful feedback writes immediately refresh the private Taste Graph so
  structured signals affect the same session.

Length feedback:
- `too_long` builds a bounded `tooLongEpisodeCountThreshold`;
- the threshold uses the lower part of the user's explicit too-long examples so
  one extremely long outlier does not make the signal useless;
- a dedicated `episodeLengthNegativeAffinity` penalizes titles at or above the
  learned threshold;
- explicit length rejection is separate from positive preferred-length affinity;
- `too_long` never damages genre/studio preference.

Ranking:
- structured negative events no longer all equal `-1`;
- `already_watched` has zero engagement penalty;
- `not_now` is deliberately weak;
- `dislike_genre` is materially stronger than generic `not_interested`;
- explicit length aversion has a bounded negative rank component;
- local temporary snoozes are filtered before scoring.

UI:
- the old one-click X no longer immediately produces an ambiguous dislike;
- X opens a native top-layer structured feedback dialog;
- dedicated `Уже смотрел` remains a fast one-click action;
- dialog reasons explain what each choice changes;
- mobile uses a one-column reason list;
- light and dark themes are supported.

Undo:
- every negative/neutral hide action produces a 6.5-second undo snackbar;
- the previous local taste snapshot is restored on undo;
- the title is reintroduced into the loaded candidate pool and reranked;
- persistent feedback is deleted server-side;
- undo waits for the in-flight feedback POST before issuing DELETE, preventing a
  POST-after-DELETE race.

Telemetry:
- structured signals continue to use the existing recommendation event pipeline;
- dismiss-like signals map to `recommendation_dismiss` with
  `feedback_signal` metadata;
- `already_watched` keeps its dedicated event;
- `feedback_policy_version` is attached for model attribution;
- no second analytics event system is introduced.

Regression coverage:
- all new DB signals;
- temporary snooze expiry;
- genre-only and setting-axis policies;
- neutral already-watched semantics;
- too-long isolation from genre/studio taste;
- Taste Graph refresh after feedback;
- local snooze ranking filter;
- feedback dialog contract;
- mobile/light-theme UI;
- race-safe undo;
- model/policy versioning.

Do not infer a long-term dislike from a temporary `not_now` action.

---

# 12. Phase I — Explainability 2.0

Status: **implemented / CI green**

Goal:
make every visible recommendation reason a deterministic explanation of the
actual weighted ranking evidence. Copy must never claim a preference that did
not contribute positively to this candidate.

Versions:
- recommendation model / algorithm: `22.5-v1`;
- ranking contract: `22.5-v1`;
- explainability contract: `22.5-explain-v1`.

Architecture:
`scoreRecommendation()`
→ weighted `RecommendationScoreComponents`
→ semantic candidate context
→ `buildRecommendationExplanations()`
→ bounded top-3 explanations
→ primary reason + source attribution
→ impression/click/watch telemetry.

Truthfulness contract:
- a user-facing reason can only be emitted when its supporting weighted
  component is positive and above a reason-specific minimum;
- negative components are never converted into positive copy;
- freshness alone cannot produce a seasonal reason;
- a preferred episode count cannot produce a length reason when the
  `episodeLength` rank component contributed zero;
- franchise copy requires a positive `franchiseContinuation` component;
- hidden-gem copy requires both hidden-gem qualification and a positive
  `hiddenGem` component;
- direct-engagement copy requires a positive `engagementPositive` component;
- generic discovery is the final fallback instead of inventing a personal
  explanation.

Evidence objects:
- `key`: stable semantic reason id;
- `text`: bounded user-facing copy;
- `components`: exact weighted rank components supporting the copy;
- `contribution`: summed positive weighted contribution;
- `contributionShare`: share of all positive weighted evidence;
- no raw private viewing history is sent to analytics.

Primary selection:
- candidate explanations are sorted by actual positive weighted contribution;
- tie priority only resolves equal/near-equal semantic evidence;
- at most three reasons are retained;
- the first reason becomes the visible card reason;
- source attribution derives from the selected primary explanation.

Supported explanation families:
- explicit liked-title reference;
- franchise continuation;
- genres the user tends to complete;
- general taste genres;
- selected mood;
- current-session intent;
- preferred studio;
- preferred format;
- preferred era;
- episode-count fit;
- completion pattern;
- binge/short-title pace;
- taste-gated current-season freshness;
- hidden gem;
- exploration bridge;
- previous direct engagement;
- community quality;
- short finished discovery;
- ongoing discovery;
- generic exploration fallback.

Specific-title evidence:
- `Похоже на «X», который тебе понравился` is allowed only when AnimeBox has
  a local explicit-like/favorite reference title sharing candidate genres;
- ordinary watch history alone is not described as "liked";
- if no explicit title reference exists, the engine falls back to genre,
  completion or other measurable evidence.

Completion language:
- AnimeBox does not expose `completionScore` as a literal probability;
- copy describes observed completion behaviour instead;
- phrases such as "you will finish this" are prohibited until outcome
  calibration exists.

Exploration language:
- an `explore` candidate can explain the familiar bridge that kept it
  relevant;
- if episode-length fit actually contributed, copy can mention familiar length;
- otherwise taste evidence may be mentioned only when the taste component was
  positive;
- fully unsupported novelty falls back to an explicit "experiment" reason.

UI contract:
- `reason` remains the compact visible single-line reason;
- `reasons` remains a backwards-compatible string list;
- `explanations` adds structured scored evidence;
- cards expose stable explanation key/version data attributes for debugging;
- match-score tooltip continues to surface the bounded reason list;
- no extra per-card network request is introduced.

Telemetry:
- impression, dwell, click, feedback and watch attribution carry:
  `explanation_version`,
  `explanation_key`,
  `explanation_components`,
  `explanation_contribution`,
  `explanation_contribution_share`;
- the explanation context is preserved from card open through player start,
  15m, 30m and completion events;
- Phase K can therefore measure conversion by actual reason family without
  reconstructing copy strings.

Performance:
- explainability is a pure in-memory pass over already computed rank signals;
- no provider request;
- no Supabase request;
- no per-card async work;
- maximum three explanation objects per ranked candidate;
- existing rail virtualization and candidate caching remain unchanged.

Regression coverage:
- no legacy `chooseReason()` path;
- no ad-hoc `reasons.push()` path;
- no reason from zero/negative component contribution;
- franchise anti-hallucination;
- liked-title anti-hallucination;
- seasonal anti-hallucination;
- length anti-hallucination;
- hidden-gem grounding;
- exploration bridge grounding;
- bounded top-3 output;
- positive contribution ordering;
- contribution-share bounds;
- source attribution;
- card → player telemetry continuity.

Reason text must remain evidence-backed even if future UI copy changes.

---

# 13. Phase J — Diversity Reranker 3.0

Status: **implemented / CI green**

Goal:
rerank the already relevance-scored candidate head so the feed does not collapse
into one franchise, genre, studio, format, era, reason source or popularity band,
while preserving the strongest personal matches.

Versions:
- recommendation model / final pipeline: `22.6-v1`;
- ranking contract: `22.6-v1`;
- diversity contract: `22.6-diversity-v3`;
- explainability contract remains `22.5-explain-v1`.

Pipeline:
`candidate retrieval`
→ `scoreRecommendation()`
→ relevance-sorted pool
→ franchise safety
→ `diversifyRecommendations()`
→ multi-rail composition.

Core rule:
diversity is a **post-ranking reranker**, not an alternative relevance model.
It may reorder candidates that are close enough in relevance, but it cannot
promote a materially weaker title merely to make the feed look varied.

Relevance guard:
- slot 1 is locked to the raw relevance winner;
- every later selection is compared with the strongest remaining raw score;
- a dynamic relevance floor combines an absolute and relative drop budget;
- strong personalization therefore keeps priority over cosmetic diversity;
- a last-resort no-floor pass exists only to avoid empty output under extremely
  sparse candidate pools;
- diagnostics expose whether constraint relaxation was required.

Candidate window:
- diversity works on a bounded head of the relevance-sorted pool;
- minimum window: 72 candidates;
- normal window: up to 6× requested output size;
- no unbounded whole-catalogue reranking is introduced.

Franchise concentration:
- canonical franchise family remains the primary dedupe identity;
- one family is preferred per diversified feed head;
- repeated family receives the strongest repetition penalty;
- if every available candidate belongs to the same family, the hard cap can
  relax rather than returning empty slots;
- continuation eligibility still comes from Phase E prerequisite logic.

Genre concentration:
- overlapping genre sets receive a recent-window similarity penalty;
- the system also tracks cumulative predicted genre share;
- cold-start feeds receive a stricter genre concentration target;
- high-confidence Taste Graph users may retain slightly more genre focus;
- a hard concentration guard activates only after enough cards have already
  been selected, avoiding unstable behaviour in the first few slots.

Studio concentration:
- studio identity is normalized independently from display copy;
- repeated studio appearances receive both repetition and share penalties;
- missing studio metadata is ignored instead of being grouped into one fake
  "unknown" studio bucket.

Format concentration:
- repeated TV / movie / OVA / ONA / special patterns receive a small penalty;
- format remains a soft constraint because a user's actual format preference
  must still be allowed to dominate when relevance is strong.

Era concentration:
- release years are grouped by decade;
- repeated decade concentration is penalized;
- adjacent individual years are not treated as unrelated eras;
- missing/invalid release years do not create an "unknown era" penalty.

Source concentration:
- the primary explainability source is tracked across selected cards;
- repeated `taste_graph`, `watch_history`, `discovery`, `franchise`,
  `taste_mood` or `engagement` sources receive a bounded penalty;
- this prevents the visible feed from being explained by exactly one signal
  family even when multiple strong evidence paths exist.

Popularity concentration:
- Phase F popularity bands are reused:
  niche / mid / mainstream / blockbuster;
- unknown popularity is not penalized;
- repeated popularity bands receive repetition and share penalties;
- this stops the head from becoming only blockbusters or only niche titles.

Confidence-aware share targets:
- cold-start users get broader genre/studio/source/popularity sampling;
- high-confidence users may keep more concentration because repetition is more
  likely to represent an actual preference;
- these targets do not change raw relevance scores.

Exploration mix:
- existing safe / adjacent / explore quotas remain;
- the class currently below its desired position receives a bounded boost;
- classes already at target receive a small over-target penalty;
- franchise continuations remain `safe`;
- diversity cannot use exploration mix to bypass the relevance floor.

Constraint passes:
1. relevance floor + franchise cap + concentration hard guards;
2. relevance floor + franchise cap + soft concentration only;
3. relevance floor + relaxed franchise cap;
4. final scarcity fill with all hard constraints relaxed.

This staged relaxation guarantees that diversity never silently converts a
limited candidate pool into missing cards.

Diagnostics:
every returned recommendation receives a bounded `diversity` object:
- `version`;
- raw/original rank;
- final reranked rank;
- raw relevance score;
- diversified comparison score;
- relevance floor;
- total diversity penalty;
- total diversity boost;
- exact per-dimension penalty/boost map;
- exploration class;
- whether hard constraints were relaxed.

The raw recommendation `score` itself is never overwritten. Diversity metadata
therefore explains ordering without corrupting the underlying relevance score.

Long-session behaviour:
- a newly fetched recommendation page is no longer diversified only inside that
  page and then appended unchanged;
- the newly loaded candidates are merged with the already loaded anime pool;
- the entire loaded pool is reranked in-memory again;
- this prevents page 2 / page 3 from gradually rebuilding the same genre/studio
  concentration that page 1 had already diversified;
- rail ownership remains sticky, so visible cards do not teleport between rows.

Telemetry:
impression, click, dwell, feedback and downstream playback attribution now carry:
- `diversity_version`;
- `diversity_original_rank`;
- `diversity_reranked_rank`;
- `diversity_penalty`;
- `diversity_boost`;
- `diversity_relaxed`.

The context survives recommendation click → player start → 15m → 30m →
completion, allowing Phase K to measure whether diversity moves improve actual
watch depth rather than only card variety.

Performance:
- no API call;
- no Supabase call;
- no provider call;
- no model inference;
- bounded in-memory candidate head only;
- no change to ScrollRow virtualization;
- no change to public candidate cache semantics.

Regression coverage:
- top relevance winner cannot be displaced;
- weak diverse candidates cannot jump through the relevance floor;
- franchise cap works when alternatives exist;
- scarcity relaxation still fills all requested slots;
- cold-start share targets are broader than high-confidence targets;
- studio concentration is actually reduced;
- controlled exploration remains present;
- diagnostics are attached to every reranked result;
- loaded-page merges trigger global loaded-pool reranking;
- diversity telemetry persists into playback attribution.

Never sacrifice a strong user match solely for diversity.

---

# 14. Phase K — Recommendation Analytics 3.0

Status: **implemented / CI validation**

Goal:
turn recommendation telemetry into a trustworthy exposure-level decision system,
not a raw counter dashboard. The primary unit is one stable
`recommendation_id` exposure, so duplicate client events cannot inflate funnel
conversion.

Versions:
- recommendation ranking remains `22.6-v1`;
- analytics contract: `22.7-analytics-v3`;
- diversity contract remains `22.6-diversity-v3`;
- explainability contract remains `22.5-explain-v1`.

Funnel semantics:
- only recommendation IDs with an in-range `recommendation_impression` enter
  the conversion cohort;
- downstream click/play/depth events without an in-range impression are kept in
  attribution coverage but excluded from funnel conversion;
- every funnel stage is a boolean per recommendation ID;
- duplicate impression / click / watch milestone events therefore count once;
- raw `product_events` remains the first-party source of truth.

Outcome maturity:
- conversion denominators are now observation-window aware;
- a brand-new impression is not immediately counted as a CTR failure;
- a playback started two minutes ago is not counted as a failed 15m/30m watch;
- CTR becomes eligible after 2 minutes;
- click → play after 10 minutes;
- click → 15m after 25 minutes;
- play → 15m after 20 minutes;
- play → 30m after 40 minutes;
- play → episode completion after 90 minutes;
- play → meaningful multi-episode continuation after 180 minutes;
- raw event counts remain visible, while conversion rates use only mature
  denominators;
- this prevents the newest traffic from systematically depressing deep-watch
  conversion.

Telemetry quality diagnostics:
- orphan recommendation exposures: downstream events whose impression is not in
  the selected cohort window;
- started-without-click;
- 15m-without-start;
- 30m-without-15m;
- multi-episode-without-start;
- completion-without-start;
- invalid timestamps;
- events more than five minutes in the future;
- oldest/newest sampled event and effective sampled-hour window are surfaced in
  the admin dashboard;
- truncation and attribution coverage remain explicit instead of silently
  presenting partial data as complete.

Primary outcomes:
- impression → click;
- click → playback;
- click → 15m;
- playback → 15m;
- playback → 30m;
- playback → episode completion;
- playback → meaningful multi-episode continuation;
- dismiss rate;
- repeated-impression rate.

Multi-episode outcome:
- new event: `recommendation_multi_episode`;
- attribution survives across episodes for the same anime;
- the event is emitted only after entering a different episode from the first
  attributed episode;
- at least 90 seconds of active viewing in the continuation episode are
  required;
- autoplay / accidental next-episode transitions therefore do not count as a
  meaningful continuation;
- the event is emitted once per recommendation attribution.

Calibration:
- displayed Match Score is grouped into 58–69 / 70–79 / 80–89 / 90+ / unknown;
- Completion Score is grouped into <0.40 / 0.40–0.59 / 0.60–0.74 / 0.75+ /
  unknown;
- each bucket reports the same downstream funnel;
- scores remain ranking features, **not literal probabilities**;
- Phase K measures whether higher buckets actually correlate with deeper watch
  outcomes before any probability language is allowed.

Taste confidence:
- each ranked recommendation now carries the private Taste Graph confidence that
  existed when it was scored;
- confidence is attached to impression/click attribution and survives into
  playback outcomes;
- dashboard buckets: cold / learning / confident / high / unknown;
- this allows cold-start performance to be separated from mature personalization
  instead of averaging them together.

Fatigue:
- fresh / light / medium / high exposure-fatigue buckets;
- each bucket reports CTR, play, 15m and dismiss behaviour;
- repeated-impression KPI uses the recommendation's pre-impression
  `exposure_count_7d`;
- repeated exposure can therefore be evaluated against actual conversion decay.

Controlled exploration:
- safe / adjacent / explore classes receive separate funnel slices;
- dashboard exposes exploration → playback and watch-depth outcomes;
- hidden-gem qualified impressions receive their own conversion KPI;
- the goal is to learn whether exploration creates meaningful watches, not only
  clicks.

Explainability:
- primary `explanation_key` from Phase I becomes an analytics dimension;
- `source` continues to mean UI/event source (for example a concrete rail);
- `evidence_source` separately records the model's primary evidence family:
  `taste_graph`, `watch_history`, `franchise`, `taste_mood`,
  `engagement` or `discovery`;
- dashboard source conversion uses `evidence_source` for new Phase K events
  and retains legacy event-source fallback for old rows;
- each reason family can be compared by CTR, playback, 15m, 30m,
  multi-episode continuation and completion;
- no copy-string parsing is required;
- future copy changes do not break historical reason-family attribution.

Diversity:
- Phase J original rank and reranked rank are compared per exposure;
- metrics include eligible / moved / promoted / demoted / unchanged;
- average absolute rank movement is reported;
- relaxed-constraint exposures are tracked separately;
- movement slices use the same downstream funnel, so diversity can be judged by
  actual watch quality rather than visual variety.

Structured feedback:
- dismiss events are broken down by `feedback_signal`;
- `too_long`, `not_now`, `dislike_genre`, `dislike_setting`,
  `not_interested`, etc. are measured independently;
- reason counts are exposure-deduplicated.

Rail health:
- existing per-rail end/load/error diagnostics are preserved;
- load fill rate, total additions, pages scanned, virtualized loads,
  max logical rail depth and max rendered DOM depth remain visible;
- conversion and runtime health now share the same row table.

Attribution coverage:
dashboard explicitly reports coverage for:
- recommendation ID;
- recommendation session;
- algorithm version;
- row;
- position;
- explanation key;
- diversity version;
- taste confidence;
- match score;
- completion score;
- exploration class.

Admin UI:
- Recommendation Analytics 3.0 header;
- exposure-level KPI strip;
- attribution-quality panel;
- algorithm-version funnel;
- Match Score calibration;
- Completion Score calibration;
- fatigue breakdown;
- Taste Graph confidence breakdown;
- safe / adjacent / explore breakdown;
- explanation-family funnel;
- diversity movement panel;
- per-rail conversion + runtime health;
- source funnel;
- structured feedback reason list;
- daily exposure trend.

Performance / scale:
- pure aggregation lives in `lib/recommendation-analytics-core.ts`;
- Supabase loader and analytics calculation are separated;
- 7d / 30d API remains admin-only and `private, no-store`;
- event scan remains bounded and explicitly exposes `truncated`;
- a dedicated `(event_name, created_at desc)` covering index supports the
  recommendation analytics scan;
- no parallel analytics table is introduced;
- no client-side analytics query;
- no new provider request;
- recommendation UX never depends on analytics availability.

Privacy:
- analytics reuses first-party AnimeBox product events;
- no exact location;
- no external browsing history;
- no advertising profile;
- no sensitive-category inference;
- dashboard groups behavioural recommendation signals only.

Regression coverage:
- duplicate event dedupe by recommendation ID;
- downstream-without-impression cohort exclusion;
- multi-episode 90s continuation threshold;
- match-score calibration buckets;
- completion-score calibration buckets;
- repeat-exposure KPI;
- hidden-gem conversion;
- safe / adjacent / explore conversion;
- fatigue dismiss behaviour;
- Taste Graph confidence buckets;
- diversity movement and relaxed constraints;
- explanation → deep-watch attribution;
- structured feedback breakdown;
- rail runtime diagnostics preservation;
- extended attribution coverage.

Analytics must measure **meaningful watch quality**, not optimize only for CTR.

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
