# Patch 18.4.3 — JS Bundle & Client Runtime Cleanup

## Goal

Reduce JavaScript that the Home page and global Navbar must parse before the user needs the corresponding feature.

Patch 18.4.2 created Server/Client boundaries. Patch 18.4.3 uses those boundaries to move optional implementation modules out of the initial client graph.

## Home recommendation engine

Before this patch both of these critical Home modules statically imported `lib/recommendations.ts`:

- `HomeHeroCarousel.tsx`
- `HomeFeedRuntimeProvider.tsx`

That module pulls ranking, diversity, taste graph and local recommendation storage into the same client graph even though personalized ordering is intentionally disabled until hydration.

Now:

- Hero renders its deterministic first slide without recommendation-engine code.
- After hydration the engine is loaded with `import('@/lib/recommendations')`.
- Loading is scheduled through `requestIdleCallback` with a bounded fallback.
- The first Hero slide remains pinned, so LCP behavior is unchanged.
- Home feed ranking uses the same lazy chunk after hydration/idle.
- A `recommendationsReady` state keeps the existing skeleton visible until the first async ranking pass completes.

## Taste / personalization

`HomeFeedRuntimeProvider` no longer statically imports runtime implementations for:

- Taste Graph refresh
- local taste profile reads
- mood persistence

The implementation modules are loaded only after the browser needs those operations. Type-only imports remain and do not enter the emitted client bundle.

## Navbar optional chunks

The global Navbar used to statically own:

- search suggestion runtime;
- Premium/sponsor membership status runtime;
- social notification badge runtime.

Now those modules are split with `next/dynamic`:

- Search suggestions do not mount or download until the query has at least 2 characters.
- Membership status runtime loads only for an authenticated user; guests receive the same lightweight Premium link shell.
- Social notification badge code loads only for an authenticated user.

This is especially useful for anonymous Lighthouse/PageSpeed visits, which should not pay for account-only runtime.

## Regression gate

New `client-bundle:check` runs during prebuild and rejects:

- static recommendation-engine imports from Hero/Home runtime;
- eager Taste Graph/personalization implementation imports;
- eager Navbar imports for SearchSuggestions, SidebarMembership or SocialNotificationBadge;
- removal of the search/auth gates;
- removal of post-hydration idle scheduling.

## Intentionally unchanged

- AuthStateProvider remains global because Navbar/account state depends on it.
- MobileAccountNav remains in the initial Navbar graph in this pass; interaction-only extraction is a later safe optimization.
- Hero media priority/LCP behavior is not changed.
- Smart Recommendation Feed remains its existing dynamic/deferred island.
- No database migration is required.
