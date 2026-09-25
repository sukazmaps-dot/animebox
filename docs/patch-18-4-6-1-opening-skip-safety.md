# Patch 18.4.6.1 — Opening Skip Safety Hotfix

## Problem

Opening auto-skip could seek across most or all of an episode, especially on long/special episodes, or expose an opening skip when the current provider cut had no compatible opening.

The failure was caused by multiple trust-boundary gaps rather than one timer bug.

## Root causes

1. `AnimePlayer` previously sought directly to `timeline.opening.endMs` without validating the segment against the real player duration.
2. `AnimeEpisodePage` requested episode timeline metadata before the player duration was known and did not send the existing `durationSeconds` API parameter.
3. Fresh `episode_timeline_meta` rows were returned for up to 30 days without checking whether their stored duration matched the observed provider duration.
4. Error/missing-identity rows could retain old segment columns, while the client did not require `lookupStatus === 'found'`.
5. AniSkip's `episodeLength` parameter is an approximate-duration filter. A provider cut whose real duration differs from the metadata duration can therefore select metadata for the wrong cut unless the observed duration is used.

## Safety policy

Auto skip now requires:

- timeline status `found`;
- a valid opening segment;
- observed player duration;
- opening duration between 8 seconds and 4 minutes;
- opening start no later than 35% of the episode and never later than 15 minutes;
- opening end no later than 45% of the episode;
- a safe tail remaining after the target;
- stored timeline duration compatible with the observed player duration.

If any check fails, automatic seek does not run.

## Real-duration refresh

`AnimePlayer` reports the first stable provider duration to `AnimeEpisodePage`.

The page then requests:

```
/api/episodes/timeline?animeId=<id>&episode=<n>&durationSeconds=<real duration>
```

Requests are sequenced and the previous timeline request is aborted, preventing a slower metadata-only response from overwriting the duration-aware response.

## Server cache behavior

A cached timeline is no longer considered usable when its duration conflicts with the observed provider duration.

When a mismatch is detected, AniSkip is queried again using the observed duration.

Rows whose lookup status is not `found` no longer expose opening/ending/recap segments through the API.

Error and missing-identity writes also clear old segment columns so stale skip metadata cannot survive a failed refresh.

## Regression protection

`opening-skip-safety:check` enforces:

- no direct seek to raw `opening.endMs`;
- auto skip requires observed duration;
- player reports real duration;
- the page sends `durationSeconds`;
- fresh cache is duration-aware;
- non-found rows cannot expose old segments;
- bounded opening length/start/end/tail guards remain in place.

No database migration is required.
