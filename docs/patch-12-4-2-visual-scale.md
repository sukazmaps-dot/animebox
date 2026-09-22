# AnimeBox Patch 12.4.2 — Visual Scale Normalization

## Goal
Make AnimeBox feel like one product by normalizing the physical scale of UI surfaces.

The patch intentionally does not make every component identical. It defines three size tiers:

- compact: chips, badges, episode controls;
- standard: normal cards, tracker rows, comments, profile surfaces;
- feature: Hero, major profile/Watch Together surfaces and primary CTA zones.

## Scale tokens

Controls:
- compact 36 px
- standard 42 px
- feature 48 px

Padding:
- 10 / 14 / 18 px

Radius:
- 10 / 14 / 18 px

Gaps:
- 8 / 12 / 18 px

## Normalized areas
- tracker;
- episode comments;
- anime-page episodes and personal controls;
- lower profile surfaces;
- Telegram/community promo;
- Watch Together;
- leaderboard;
- mini-profile.

Anime posters keep their media aspect ratios. Feature heroes stay intentionally larger.

## Mobile
Mobile is the primary target. Standard cards use roughly 12–14 px padding and 14 px radius; normal controls use 42 px height. Large CTA controls remain 48 px.

## Boundaries
No business logic, player, progress, tracker backend, Premium lifecycle, recommendation scoring or database schema changes.
