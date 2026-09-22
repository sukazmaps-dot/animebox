# AnimeBox 12.4.5 — Identity Foundation

## Product goal
Remove the generic AI/SaaS visual feel without spending several standalone patches repainting individual pages.

12.4.5 defines the visual grammar that all later feature patches (12.5 Player, 12.6 Retention, 12.7 Social) must reuse.

## Rules

### 1. Ink palette
AnimeBox is no longer based on generic black/gray SaaS surfaces.
The base is a cold ink/navy family with subtle temperature differences between page, standard surface and raised surface.

The existing violet remains part of AnimeBox, but it is no longer used as glow decoration everywhere.

A warm editorial signal color is added for tiny section markers/numbers. It is not a second CTA color.

### 2. Radius contrast
Do not round every element the same way.

- compact controls: 6 px;
- standard cards/surfaces: 8 px;
- feature surfaces/Hero: 18 px;
- exceptional modal/profile feature shell: up to 22 px.

Touch target heights do not shrink.

### 3. Surface before border
Normal separation order:
1. surface tone;
2. spacing;
3. subtle shadow/inset highlight;
4. border only when semantic/structural separation is still needed.

No default neon outline around normal cards.

### 4. Editorial Home
Home section blocks now receive automatic 01/02/03… editorial markers through CSS counters.
No React/data logic is added for this.

The marker uses the warm signal while CTA/progress retains AnimeBox iris violet.

### 5. Media cards
Posters stay dominant.
Normal hover:
- 2 px lift of the media surface;
- tiny crop movement;
- small contrast/saturation change;
- no large scale-105;
- no purple halo.

### 6. Feature surfaces
Hero and true feature surfaces remain deliberately softer/larger than utility UI.
The site must not become a grid of equally sharp boxes.

### 7. Performance contract
Identity work must not add:
- web fonts;
- canvas;
- large decorative images;
- new blur layers;
- JS animation libraries.

This patch is CSS-only apart from loading the stylesheet.

## Future patch contract
Every next feature patch must include:
- feature logic;
- UX states;
- AnimeBox identity treatment;
- mobile QA;
- performance/regression check.

Do not schedule a second standalone redesign of the same component unless user testing reveals a specific issue.
