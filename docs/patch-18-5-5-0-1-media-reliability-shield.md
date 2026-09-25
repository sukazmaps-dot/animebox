# Patch 18.5.5.0.1 — Media Reliability Shield

## Goal

Fix the two failure classes visible in production screenshots:

1. mass poster requests from `media.youranimebox.com` returning HTTP 502;
2. the Service Worker throwing
   `Failed to execute 'clone' on 'Response': Response body is already used`.

This patch must improve failure recovery without turning poster loading into an eager flood and without changing image quality.

---

## 1. Service Worker response-body race

### Root cause

The current cache writer clones a `Response` only after awaiting `caches.open()`.
Meanwhile the original response has already been returned to the browser and its body may be consumed.
The later `response.clone()` can therefore throw.

### Fix

- clone the response synchronously before the first await;
- use the clone only for Cache Storage;
- return the untouched original response to the page;
- attach background cache work to the current FetchEvent via `event.waitUntil()`;
- catch background cache failures so they never become unhandled promise rejections;
- keep HTML/private-route exclusions unchanged.

### Rollout

- bump the public cache namespace from `animebox-mobile-v1` to `animebox-mobile-v2`;
- activation removes obsolete AnimeBox cache namespaces;
- existing `skipWaiting()` + `clients.claim()` makes the fixed worker take ownership quickly after deployment.

---

## 2. Media Worker origin fallback budgets

### Root cause class

The current Worker uses one AbortController / one 8-second deadline for both:

1. Cloudflare Image Transformation fetch;
2. raw origin fallback fetch.

If the transform attempt consumes most of that deadline, the raw fallback receives little or no usable time and can be aborted immediately. That converts a recoverable transform failure into a 502.

### Fix

Use independent bounded attempts:

- transform attempt: its own timeout;
- raw origin attempt: a fresh controller and its own timeout;
- if transformed fetch fails but raw succeeds, serve raw with the existing short transform-fallback cache policy;
- no unbounded retry loops;
- no extra client-side fan-out.

The worker remains fail-soft: a transform outage must not imply an image outage when the raw source is still reachable.

---

## 3. Bounded transient retry

For the raw origin path only:

- retry at most once;
- only for retryable transport/upstream states (timeout, 408, 425, 429, 5xx);
- use a very small bounded delay;
- do not retry permanent 4xx such as 404;
- transformation failure itself does not trigger repeated transformation calls.

This is intended for brief origin/CDN turbulence, not for bypassing permanent upstream restrictions.

---

## 4. Negative-cache shield

A completely unavailable origin can otherwise cause dozens of cards to hammer the same failing upstream.

For final 502 responses:

- cache the negative result at Cloudflare edge for a short period only;
- keep browser caching short;
- include `Retry-After`;
- keep cache key variant/source-specific;
- never write a failed image into the R2 poster namespace.

This reduces thundering-herd load while allowing quick recovery.

---

## 5. Diagnostics

Every media failure response must expose normalized, non-sensitive diagnostics:

- `X-AnimeBox-Media`;
- `X-AnimeBox-Origin`;
- `X-AnimeBox-Origin-Error`;
- `X-AnimeBox-Transform-Error`;
- `X-AnimeBox-Raw-Error`;
- `X-AnimeBox-Origin-Attempts`.

Do not expose query strings, tokens, source paths or raw exception messages.

The health endpoint should expose the new media reliability protocol revision and bounded timeout/retry configuration.

---

## 6. Client fallback contract

Do not remove the existing bounded client candidate chain:

1. AnimeBox Media Edge;
2. optional regional AnimeBox media edge;
3. direct original image;
4. secondary original image;
5. same-origin legacy image proxy;
6. local placeholder.

A 502 from the media Worker should therefore remain recoverable by `AnimeImage.onError`.

No global eager loading is introduced.

---

## 7. Legacy image proxy

Keep the same-origin `/api/image` route as the final network fallback.

Harden only its diagnostics:

- distinguish timeout / upstream status / non-image failures where possible;
- return a normalized `X-AnimeBox-Image-Error` header on failures;
- keep the allow-list, size cap and rate limit unchanged.

Do not add broad new upstream hosts.

---

## 8. Regression gate

Add `patch18-5-5-0-1:check` covering:

- Service Worker clones before any await;
- Service Worker background cache writes use FetchEvent lifetime;
- background cache failures are swallowed/logged rather than unhandled;
- cache namespace version bumped;
- transform/raw media attempts use separate AbortControllers;
- raw fallback has its own timeout budget;
- only retryable states receive one bounded retry;
- final 502 receives short negative-cache headers;
- R2 never receives failed/untransformed variant bytes;
- diagnostic headers are present and privacy-bounded;
- client image candidate chain still contains direct + secondary + legacy proxy fallbacks;
- near-viewport warmup from 18.5.5.0 remains intact;
- existing image/mobile performance checks remain green.

---

## Release gates

- TypeScript;
- targeted lint;
- retention regression;
- production build;
- image-delivery regression;
- mobile-performance regression;
- 18.5.5.0 media warmup regression;
- 18.5.5.0.1 media reliability regression.

No SQL migration is required.

The repository Worker and deployed Cloudflare Worker must be kept on the same revision before the fix is considered fully released.
