# Patch 16.5 — Profile Identity & Widgets

## Goal

Turn the AnimeBox profile from a statistics page into a personal anime identity surface.

Patch 16.5 introduces a reusable widget system for both the owner's profile and public profiles. It also keeps the existing Premium Profile Studio as the single source of profile color variables, so every new surface follows the user's selected Premium palette.

## Widgets

The profile supports five widgets:

- Favorites — up to six anime selected manually by the user.
- Watching — current `watching` titles derived from the tracker.
- Ratings — top personal AnimeBox ratings plus average/count.
- Anime DNA — weighted genre profile derived from library, ratings, and favorites.
- Activity — recent rating and library status changes.

The user may reorder and hide widgets. Default layout is used when no preferences have been stored yet.

## Favorite anime

Favorite anime is intentionally separate from tracker/library status.

The profile editor searches the normal AnimeBox catalog/API pipeline. Before a favorite is persisted, `ensureAnime()` guarantees the title exists in `anime_catalog`.

Maximum: 6 favorites per profile.

## Data architecture

New tables:

- `profile_favorite_anime`
- `profile_widgets`

Existing data sources are reused for derived widgets:

- `anime_library`
- `anime_ratings`
- `anime_catalog`

No separate activity-event table is introduced. The initial activity feed is derived from existing rating and library timestamps.

## Security

Both new tables:

- have RLS enabled;
- expose no direct access to `anon`;
- allow authenticated CRUD only through own-row policies;
- allow `service_role` server reads for public profile aggregation.

Public profile rendering never needs to make these tables directly readable to anonymous browser clients.

## Premium profile palette

All new widget surfaces consume the existing Profile Studio variables:

- `--profile-theme-primary`
- `--profile-theme-accent`
- `--profile-theme-accent-rgb`
- `--profile-theme-text`
- `--profile-theme-border`
- `--profile-theme-surface`

This means a Premium user's selected profile colors affect:

- widget shells;
- borders and backgrounds;
- Anime DNA progress bars;
- buttons and focus states;
- empty states;
- widget editor;
- default code-rendered profile banner.

The existing contrast protection in `premiumStudioCssVariables()` remains authoritative.

## No-AI UI asset direction

Patch 16.5 removes the old bitmap default profile banner from owner and public profile rendering.

The fallback banner is now a CSS-rendered AnimeBox surface and inherits Premium colors when applicable.

Premium Studio no longer falls back to `/premium/premium-user.webp` when no Premium avatar is uploaded. The editor and preview now use a code-drawn SVG avatar placeholder that inherits the selected Premium accent.

The previous profile collection bitmap empty state was already replaced in Patch 16.4.1 with SVG/CSS UI art.

## Responsive behavior

Desktop uses a two-column widget grid with wide Favorites and Activity blocks.

Mobile collapses to a single-column profile, simplifies poster grids, hides nonessential activity timestamps, and turns the editor into a bottom-aligned sheet.

## Migration

Production migration:

`20260924115516_profile_identity_widgets_v1`
