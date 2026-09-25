# Patch 18.4.2 — Home Server/Client Decomposition

## Goal

Remove the 1,426-line `HomePageClient.tsx` client monolith without changing the Home visual hierarchy or duplicating server data fetches.

## Before

`app/page.tsx` fetched the public initial feed on the server and then handed the entire page to one `'use client'` component.

That client component owned:

- hero fallback state;
- local watch history;
- authenticated recent-watch sync;
- taste/mood state;
- personalized ranking;
- progress overlays;
- schedule loading and clock;
- personal schedule;
- retention signals;
- catalog rendering;
- right rail;
- static shortcuts and utility copy;
- deferred chat/support/Telegram surfaces.

A schedule clock tick or unrelated Home state change could therefore traverse the same large component tree.

## After

### Server-owned shell

`components/home/HomePageShell.tsx` is a Server Component.

It owns the stable Home document structure:

- two-column Home grid;
- section ordering;
- quick links;
- tracker utility card;
- composition of client islands.

It does not contain `'use client'`.

### Feed runtime domain

`HomeFeedRuntimeProvider.tsx` owns only feed/personalization state:

- resilient popular/ongoing fallback loading;
- auth-aware recent watch data;
- local watch history;
- taste graph refresh;
- mood;
- recommendation ranking;
- progress map;
- Continue Watching data;
- personal anime IDs;
- retention completion candidates.

### Schedule runtime domain

`HomeScheduleRuntimeProvider.tsx` owns only schedule/time state:

- deferred `/api/schedule` request;
- schedule tabs;
- one-minute clock;
- upcoming episodes;
- personal schedule;
- retention episode signal;
- schedule impression analytics.

Schedule ticks no longer live in the same state owner as recommendation ranking.

### Client islands

The visual surface is split into explicit client leaves:

- `HomeHeroSection`
- `HomeDiscoverySection`
- `HomeCatalogSections`
- `HomeScheduleSection`
- `HomePersonalScheduleSection`
- `HomeRetentionSections`
- `HomeDeferredCommunity`
- `HomeRightRail`

Heavy below-fold features remain behind `DeferredMount` and/or `next/dynamic`.

## Preserved hierarchy

The patch keeps the existing order:

1. Hero
2. Continue Watching / mood / personalized recommendations
3. Personal schedule
4. shortcuts
5. deferred chat
6. popular + ongoing catalog
7. global schedule
8. retention / pulse / activation
9. utility cards
10. right rail

## Regression gates

`frontend-architecture:check` now fails if:

- `components/HomePageClient.tsx` returns;
- `HomePageShell` becomes a Client Component;
- the server shell grows beyond 180 lines;
- feed runtime grows beyond 800 lines;
- schedule runtime grows beyond 560 lines;
- required Home island boundaries disappear.

Existing hydration, discovery, mobile-performance and watch-service checks were moved to the new ownership files.

No database migration is required.
