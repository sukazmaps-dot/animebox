# Patch 11.1 — Telegram Growth + Profile Media UX

## Telegram Growth
- Canonical channel: https://t.me/yourAnimeBox / @yourAnimeBox.
- Replace the old Mini App utility card with a channel-first growth card.
- Track promo impression, click and dismiss through existing product analytics.
- Hide the promo for confirmed Telegram channel members inside Mini App.
- Add a 7-day frequency cap after manual dismiss.
- Keep the bot/Mini App identity separate from the public channel identity.

## Profile Media UX
- Automatic AI moderation is opt-in via PROFILE_MEDIA_AUTO_MODERATION=true.
- Default behavior: technical validation -> immediate publish/apply.
- Keep upload size/MIME constraints and add server-side image signature validation.
- Keep manual admin removal/reporting infrastructure.
- Automatic retry worker must no-op while moderation is disabled.
- Existing moderation tables remain intact for a future re-enable.

## Acceptance
- Safe profile media saves without OpenAI latency when flag is absent/false.
- Telegram channel promo never blocks the page.
- Promo analytics are accepted by /api/analytics/product.
- TypeScript, targeted ESLint and production build pass.
