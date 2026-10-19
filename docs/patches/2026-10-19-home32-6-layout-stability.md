# Patch 32.6 — Home Layout Stability

## User evidence
- Desktop-mode Chrome screenshots show a single **История продолжается** recommendation with an enormous unfilled shelf.
- Poster peeks at the right edge look blackened/partially covered despite existing working horizontal scroll.
- Mobile screenshots show the community promos as two oversized stacked cards with a detached close button and a large reserved gap before the footer.
- Source inspection confirms that this is **AnimeBox's own support/Telegram promos**, not a third-party advertising placement.

## Scope
1. Preserve actual terminal 1–2-title recommendation rails and render them in a compact, purpose-built two-column layout (stack on mobile). Don't add unrelated anime to a franchise continuation. Keep 3+ title rails full width.
2. Empty terminal rows can hide; empty recoverable rows keep retry. Do not change candidate paging/ranking, exhaustion, API contracts, ownership, impression analytics or request budgets.
3. Remove both cinematic-home poster viewport masks; partial next poster is its own horizontal scroll hint.
4. Place the promo dismiss button inside a shared heading with a 44×44 touch target. Unify support and Telegram into a responsive, compact two-card strip while retaining their existing links, analytics, dynamic loading and localStorage dismissal.
5. Reduce redundant late-page vertical gaps. Do not remove the accessibility clearance needed beneath mobile fixed navigation.

## Implementation
- `components/SmartRecommendationFeed.tsx`: `compactSparse` and `data-recommendation-visible-items`; terminal singleton never disappears.
- `components/home/HomePageShell.module.css`: scoped terminal shelf styles, no edge masks, less home spacing; no global patch file.
- `components/home/HomeDeferredCommunity.tsx` + `HomeFooterPromos.module.css`: one shared promotion header and close, two existing deferred components, compact responsive support/Telegram layout.
- `tests/home32-layout-regression.cjs`: execute real production sparse-rail predicates on 0/1/2/3 items, recoverable and terminal states; static ownership contracts.
- `scripts/home32-browser-smoke.cjs`: existing real-browser settled-page audit now catches detached close and oversized mobile promos.

## Acceptance / release gates
- GitHub Quality Gate, `home32:check`, `home32:browser`, CSS module build, TypeScript and Next production build all pass.
- Visual checks at 360, 390, 412, 768, 1366 and 1920 px. Test mobile Chrome **desktop site** separately: this emulation can produce a desktop layout and is not equivalent to a mobile CSS viewport.
- No uncaught console errors, unexpected requests or new DB/Cloudflare/R2 dependencies.
- Existing promo dismissal and direct Telegram/support destinations still work.

## Out of scope
- Larger changes to recommendation candidates/automatic network page scan budgets, extra poster fetches, R2 write policy, monetization ads, hero source selection, Supabase schema, Telegram logic.
- We cannot guarantee every rail contains 5+ eligible anime; correctness and genuine relevance beat artificially padded cards.

## Production plan
Review CI and settled screenshot geometry before merging. Railway auto-deploys after merge. Check deployment SUCCESS for the exact merge SHA and HTTP response health; rollback if navigation or primary homepage renders regress.
