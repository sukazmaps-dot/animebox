# AnimeBox Patch 12.4.3 — Final Visual QA

## Leaderboard Top-3

Fixed the podium avatar composition visible on mobile after the visual-scale pass.

Root cause:
- rank artwork was positioned relative to the whole podium card;
- avatar/rank badge were positioned relative to avatarStage;
- compacting podium cards in 12.4.2 made those coordinate systems drift apart.

Fix:
- rank artwork now lives inside avatarStage;
- wreath/art, avatar, crown and rank seal share one fixed stage;
- Premium avatar crop is clipped inside a dedicated circular avatarClip;
- top-1 keeps a larger feature scale, while top-2/3 use the standard podium scale;
- hover transforms preserve the centered artwork transform;
- leaderboard gets safe bottom space above the fixed mobile navigation.

No ranking, watch-time, profile, Premium entitlement or backend logic changed.
