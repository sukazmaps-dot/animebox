# AnimeBox Patch 18.9.3 — Premium Effects Production Hardening

## Goal

Bring Premium atmosphere rendering to production quality across full profiles,
Studio live preview, social mini-profiles, Global Chat, comments and Watch Together.

## Root causes fixed

1. Particle positions/timings used CSS multiplication with `--particle-index`.
   Some browser engines could invalidate left/duration/delay silently.
2. Stardust inherited `top: 110%` but only drifted a few pixels upward,
   so stars remained below the visible card.
3. Sakura inherited the same bottom origin even though petals must fall from above.
4. Compact mini-profile atmosphere opacity was too weak in the normal 30–50% range.
5. Reduced-motion hid particle identity entirely instead of only disabling movement.
6. Premium mini-profile layering accidentally changed the close button to
   `position: relative`, moving the X button to the left edge.
7. Premium CSS still contained custom-property multiplication for glow alpha.

## Deterministic renderer

`PremiumProfileAtmosphere` now computes particle geometry once from stable indexes.
No Math.random is used.

Each particle receives precomputed CSS variables:
- --particle-left
- --particle-static-top
- --particle-duration-soft
- --particle-duration-live
- --particle-delay
- --particle-drift-x
- --particle-rise-y
- --particle-fall-y
- --particle-scale
- --particle-rotation

Variants:
- full: 14 particles
- preview: 11 particles
- compact: 8 particles

## Effect physics

- Aurora: ambient clouds + sparse distributed static/twinkling dust.
- Embers: particles rise from the bottom.
- Sakura: petals start above the card and fall downward.
- Stardust: stars are distributed over the visible surface and twinkle in place.

## Motion modes

- Off: no ongoing animation; particles remain as a static composition.
- Soft: long calm durations.
- Live: faster particle motion and stronger identity.

## Accessibility

`prefers-reduced-motion` disables animation but keeps a static Premium composition.
Premium identity therefore remains visible without forced motion.

## Intensity semantics

- 0% means visually off.
- 30–50% is tuned as the normal useful range.
- Higher values remain bounded.

## Mini-profile close button

The Premium layering selector no longer makes `.close` relative.
The close button is explicitly pinned to the top-right overlay with its own z-index.
Mobile receives a separate safe inset.

## Cross-browser CSS

No particle layout/timing depends on CSS multiplication of custom properties.
The remaining half-glow value is precomputed in TypeScript instead of using
`calc(var(--ab-premium-glow-alpha) * .5)`.

## Performance budget

- no requestAnimationFrame particle loop;
- deterministic static markup;
- full/preview/compact density variants;
- only the open mini-profile renders compact particles;
- mobile mini-profile further reduces visible particle count;
- CSS animation is fully disabled in Off/reduced-motion modes.

## Acceptance

- TypeScript passes.
- Targeted lint has zero errors.
- product/retention regression checks pass.
- production build passes.
- no `--particle-index` remains in the renderer/CSS.
- no Math.random exists in Premium atmosphere renderer.
- Stardust is visible inside mini-profile bounds.
- Sakura starts above and falls through the card.
- Embers rise through the card.
- close X stays in the top-right on Premium mini-profile.
- Global Chat / comments / Watch Together keep using the same ProfilePreview.

## Quality gate trigger

PR #121 must pass the cumulative main-based production workflow before packaging.


## Foreground layering fix

Premium atmosphere is split into two rendering planes:
- ambient layer below profile surfaces;
- particle layer above opaque surfaces but below close/actions.

The atmosphere wrapper itself must not use paint containment because that would trap
foreground particles in a lower stacking context and make them invisible behind hero/body backgrounds.


## Mini-profile stacking flattening

The atmosphere wrapper uses `display: contents` so ambient and particle layers participate directly in the card stacking context. The final compact order is ambient z=1, hero/body z=3, particles z=4 and close z=20. Compact Stardust uses 10 deterministic particles with stronger 4–5px star highlights.
