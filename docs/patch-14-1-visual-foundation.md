# Patch 14.1 — AnimeBox Visual Foundation

## Goal

Create one canonical visual language for AnimeBox before redesigning individual surfaces in 14.2–14.6.

The site had accumulated multiple presentation layers over time. This patch intentionally does not rewrite every screen. Instead it defines a final global layer that subsequent UI patches must build on.

## Identity language

AnimeBox now uses four primary visual ideas:

- **Ink** — near-black blue/graphite background instead of generic pure black.
- **Porcelain** — slightly warm off-white for primary content instead of harsh SaaS white.
- **Iris** — the AnimeBox violet. It is reserved for identity, selected states and primary actions.
- **Ember** — a warm editorial signal used sparingly for human emphasis and links.

The goal is to reduce the generic neon-purple SaaS look while keeping AnimeBox recognisable.

## Surface hierarchy

Standard UI surfaces separate primarily by tone.

Borders are intentionally quiet and glow is not used as the default way to make a card visible.

Feature surfaces may remain softer/larger than ordinary controls so important content still has hierarchy.

## Geometry

Standard controls use sharper geometry than feature cards.

The global radius scale now distinguishes:

- tiny metadata chips;
- buttons/search/filter controls;
- ordinary content cards;
- large feature/hero surfaces.

## Controls

Buttons, search fields and filters now share:

- consistent transition timing;
- semantic focus-visible rings;
- restrained active states;
- a single primary iris action color;
- neutral secondary surfaces.

## Media cards

Anime cover art remains visually dominant.

The card shell itself is quieter, hover movement is limited to the media surface, and passive card borders no longer glow.

## Accessibility / mobile

The foundation adds:

- visible keyboard focus;
- reduced-motion handling;
- mobile safe-area padding;
- touch-first mobile hover suppression;
- text selection styling with AnimeBox identity.

## Scope

14.1 is intentionally foundation-only.

The following remain separate patches:

- 14.2 Mobile Shell & Navigation
- 14.3 Home & Discovery
- 14.4 Catalog & Search
- 14.5 Anime Page
- 14.6 Player Experience
- 14.7 Profile / Community polish

This prevents a large visual rewrite from mixing navigation, product logic and content hierarchy changes in one deployment.
