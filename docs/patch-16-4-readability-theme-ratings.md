# Patch 16.4 — Readability, Theme Foundation & Community Ratings

## Goal

Close the strongest UI feedback from the latest community review without doing another full redesign:

- make small text easier to read;
- introduce a real light theme while preserving AnimeBox identity;
- let users rate anime themselves;
- repair the broken Telegram promo inside Watch Together.

## 1. Readability

The patch adds a final typography layer loaded after the current AnimeBox visual language.

It raises the smallest recurring UI labels and metadata, improves line-height, and increases several mobile card/text sizes without changing the overall layout density.

The goal is not to make every element large. It is to remove the 7–9px text that is unnecessarily hard to read.

## 2. Theme foundation

User preferences now support:

- `dark`
- `light`
- `system`

The default remains `dark` for existing users.

Theme preferences are stored locally together with the existing viewing/interface preferences.

A before-interactive bootstrap applies the saved theme before the first paint, preventing a dark/light flash during page load.

`UserPreferencesBridge` is now mounted globally. This also activates the existing reduce-motion preference at the root level.

Light mode uses a warm off-white canvas instead of pure white, keeps the violet AnimeBox accent, and preserves dark media/player surfaces where a light video surface would reduce usability.

## 3. AnimeBox community ratings

A new `anime_ratings` table stores one 1–10 rating per user and anime.

The rating is independent from the tracker/library, so a user may rate a title without adding it to their watch list.

Security model:

- `anon`: no direct table access;
- `authenticated`: only own row through RLS;
- `service_role`: aggregate access for the public summary API.

A `security_invoker` aggregate view exposes only:

- anime ID;
- average AnimeBox score;
- number of ratings.

The public API never returns the list of voters or their user IDs.

The anime page displays:

- AniList score (existing external score);
- AnimeBox community score;
- current user's own score;
- 1–10 control;
- ability to update or remove a rating.

## 4. Watch Together Telegram promo repair

The Watch Together community variant previously declared grid columns without guaranteeing `display: grid`.

Patch 16.4 gives it an explicit layout contract for:

- desktop;
- tablet;
- mobile;
- light theme.

The Telegram promo now has predictable artwork/content columns, safe padding for the dismiss button, readable type, and a full-width CTA on narrow screens.

## Database migration

Production migration creates:

- `public.anime_ratings`
- `public.anime_rating_summary`

The migration is applied only after TypeScript, targeted lint, regression checks and production build pass.
