# Patch 31.1 — integration of unsquashed 30.1 + 30.8

Target: `main` at 013ef7e (Patch 30.9). Isolated integration branch, no database migration.

## Conflict decisions
1. Carry Patch 30.8 curated mobileHeroImage and mobileHeroPosition, responsive <picture>, full-bleed artwork and lower scrim, desktop banner, Continue Watching CSS, regressions.
2. Reapply Patch 30.1 home mood picker, keyboard roving tabindex, independent mood tiles, desktop cinematic content/summary and compact recommendation action footer.
3. Scope Patch 30.1 hero geometry to desktop min-width 769px to avoid overriding 30.8 mobile height, image position and text contrast. Hide optional long synopsis/eyebrow on mobile to preserve space for title/actions.
4. Preserve existing AnimeIntentLink prefetch on intent (30.7) in SmartRecommendationCard: do not replace whole component with stale PR #230 version.
5. Preserve Patch 30.9 profile media and existing package/prebuild requirements. Merge Patch 30.8 tests into current package/CI rather than restoring its old package.json.
6. Combined hydration fixture includes carousel, Continue Watching, mood radios and recommendation cards. Existing homepage browser script exercises mobile full bleed, focal point, theme contrast, carousel/pagination, keyboard navigation, recommendation dialog/actions, and post-failure image recovery.

## Validation
- `npm run patch31-1:check`, `npm run patch30-8:check`, `npm run patch30-7:check`.
- Full `npm run prebuild`, TypeScript, eslint, production build via Quality Gate.
- Browser matrix: 320–3840px, light/dark, artwork fallback, keyboard/feedback, cards, Continue Watching.
- No auth, payments, Watch Together API, Premium editor or Supabase migration touched.

## Reversal
Revert PR after explicit release approval. Do not merge old PR #230/#239 afterward: this integration supersedes their overlapping changes, pending verified tests.
