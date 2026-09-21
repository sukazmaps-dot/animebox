# Patch 11.1 — Telegram Growth + Profile Media UX

## Telegram Growth
- Canonical channel: https://t.me/yourAnimeBox / @yourAnimeBox.
- Replace the old Mini App utility card with a channel-first growth card.
- Track promo impression, click and dismiss through existing product analytics.
- Hide the promo for confirmed Telegram channel members inside Mini App.
- Add a 7-day frequency cap after manual dismiss.
- Keep the bot/Mini App identity separate from the public channel identity.

## Profile Media UX
- AI moderation is removed from the active AnimeBox profile-media architecture.
- Flow: private quarantine upload -> technical validation -> immediate publish/apply.
- Keep upload size/MIME constraints and server-side image signature validation.
- Keep manual admin control for legacy review entries and post-moderation workflows.
- There is no OpenAI moderation request, retry worker, quota dependency, or feature flag.

## Acceptance
- Safe profile media saves without any OpenAI dependency.
- Telegram channel promo never blocks the page.
- Promo analytics are accepted by /api/analytics/product.
- TypeScript, targeted ESLint and production build pass.
