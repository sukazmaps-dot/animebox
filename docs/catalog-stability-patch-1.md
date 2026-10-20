# Audit patch 1: stable catalog and search

## Problem

The instant index can return ten verified matches, then `/api/anime` falls back
to three saved matches. First-page enrichment previously treated that partial
snapshot as authoritative membership and removed seven visible cards.

## Changes

- Saved and registry-degraded responses explicitly identify partial coverage.
  Old responses with `catalogMeta` remain compatible.
- A saved fallback supplements this query/filter/mood scope; it cannot remove
  previously loaded verified matches. Fresh complete responses still own order
  and membership, including an empty result.
- A slower instant preview can supplement a saved response without keeping the
  page loading, changing pagination, or replacing known metadata with shells.
- Availability exclusions override retention. Registry degradation deliberately
  keeps its fail-closed membership and does not revive the instant preview.
- Query, filter, mood and view changes synchronously invalidate requests and
  lock load-more. Stale successes/failures cannot write into a new request.
- Repeated load-more calls remain synchronously deduplicated. A failed page
  retries that same page; a source change cannot combine incompatible offsets
  and offers a restart at page 1 while retaining visible cards.
- SSR passes source and `hasNextPage`, instead of guessing paging from count.
- Explicit retry bypasses client memory and browser HTTP caches and is available
  on partial notices as well as errors. No change to normal cache TTLs.
- The initial debounce no longer resets an already requested second page.

## Acceptance

`npm run catalog-stability:check` mounts the actual catalog with deferred service
responses and checks instant-first/saved-first races, complete-empty responses,
late previews, exclusions, registry degradation, query/filter isolation, double
load-more, same-page retry, source changes, SSR paging and metadata retention.
It runs as part of `catalog-integrity:check` and therefore `prebuild`.

Existing API/metadata/client tests additionally cover explicit exclusions,
fallback cache expiry, forced refresh, availability policy and provider outage.
Two test fixtures were updated for index exports/imports added by main #296.

## Release

No SQL migrations, new environment variables or production data changes.
Merge and deploy the branch through the normal release process. Canary checks:
search `Евангелион`, type another query before completion, change a filter,
load another page and retry after a provider outage. A fallback must not collapse
the current query's verified results; a fresh complete response may replace them.

This patch does not make unavailable third-party providers healthy and does not
change image delivery, playback, design or recommendation ranking.
