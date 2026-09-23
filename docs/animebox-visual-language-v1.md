# AnimeBox Visual Language v1 — Dark Anime Aurora

## Goal

Create a recognisable AnimeBox interface language without returning to noisy glassmorphism or flat admin-dashboard minimalism. The UI stays ordered and readable, while important surfaces gain local depth, violet/cyan light and restrained motion.

## Core rules

- 80–90% of the interface remains calm and dark; glow is local, not global.
- No AI-generated illustrations or decorative raster 3D art in the refactored surfaces.
- Icons use one outline family (Phosphor) in the resting state. Fill is reserved for active state/status.
- Important blocks use three layers: dark surface → local aura → icon/content.
- Hairline borders stay neutral. Violet is used for identity, not for every border.
- CTA height is 44px with 10px radius.
- Motion vocabulary: `float` (3–4s), `ring` (2–2.5s), `lift` (160–220ms).
- Respect `prefers-reduced-motion` / `useReducedMotion`.

## Brand tokens

- Canvas: `#070a10`
- Surface: `#0c111a`
- Raised: `#111823`
- Text: `#f5f6fb`
- Muted: `#929cad`
- Violet: `#9278ff`
- Violet light: `#b09cff`
- Cyan: `#6fdcff`

Runtime source: `app/animebox-visual-language-v1.css`.

## Signature motifs

### Luminous spine

A thin local violet → cyan light line for feature sections and active navigation. It should never become a thick decorative bar.

### Icon core

Reusable component: `components/ui/AnimeBoxIconCore.tsx`.

Every hero/empty-state icon can use a restrained square shell plus a blurred local aura. The icon remains SVG.

### CTA family

- `.ab-action.ab-action--primary`
- `.ab-action.ab-action--secondary`

Both are 44px high and share the same interaction rhythm.

## Refactored surfaces

- Desktop sidebar / Premium membership
- Guest and authenticated Tracker empty states
- Telegram anime-notification banner
- Telegram channel promo (vector-only)
- Episode community/discussion banner
- Quiet tab styling foundation

## Anti-patterns

Do not add:

- glow around every card;
- purple borders on every surface;
- giant rounded SaaS cards;
- random 3D WebP art for utility UI;
- emoji in place of UI SVGs;
- unrelated animation styles per component.

## Leaderboard Visual v2

The leaderboard follows the same Dark Anime Aurora language instead of a dashboard-card layout.

- The hero is intentionally compact and contains the user's rank summary instead of ornamental empty space.
- Ranking mode and period controls share one restrained segmented-control language; the active period uses a moving Framer Motion indicator.
- Section headings use the AnimeBox luminous spine motif.
- Top 3 remains on dark AnimeBox surfaces. Gold / silver / bronze are accents only, never full-card themes.
- Rank 1 has the largest avatar, a subtle crown float and a restrained gold aura mixed with the global violet identity.
- Rank numbers are rendered as oversized low-opacity background typography to create depth without raster art.
- The user's own position is a compact pinned strip with time, episodes and level.
- Places 4–100 use a dense row system with a left glow reveal on hover and a direct profile affordance.
- Reduced-motion users receive the same hierarchy without looping motion.
