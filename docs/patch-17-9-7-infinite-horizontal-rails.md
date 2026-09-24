# Patch 17.9.7 — Infinite Horizontal Rails + Top Rank cleanup

## Horizontal recommendation rails

The previous implementation had two subtle stop conditions:

1. the candidate API treated any filtered page shorter than the requested
   limit as end-of-catalogue, even though later upstream pages could still
   contain eligible anime;
2. freshly fetched candidates were appended to the shared pool without first
   being reserved for the rail that requested them, so earlier rails could
   claim those cards during layout and leave the triggering rail visually
   unchanged.

The fix keeps the shared request/cache architecture but reserves matching
candidates in railOwnershipRef before the next layout pass. A rail first
claims already-loaded unowned candidates, then scans up to six candidate pages.
After three strict misses, explore/quick-watch rails use a bounded relaxed
matcher. A temporary sparse rail can be retried after another rail advances
the shared candidate stream.

The candidate endpoint now continues pagination while the current filtered
page is non-empty; a short filtered page no longer incorrectly means EOF.

## Top Anime

Ranking labels now render as 1, 2, 3, 4, 5 instead of 01, 02, 03, 04, 05.

No SQL migration is required.
