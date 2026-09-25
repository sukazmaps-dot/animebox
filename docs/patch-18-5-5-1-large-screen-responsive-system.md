# Patch 18.5.5.1 — Large Screen Responsive & Typography System

## Why this patch exists

The current AnimeBox desktop shell is usable at 1280–1920 CSS px, but on high-resolution and very wide displays it still behaves like a fixed 1440/2K canvas:

- content width stops growing too early;
- the home page becomes a small island surrounded by dead space;
- the right rail remains visually narrow;
- hero height does not scale with the available desktop canvas;
- many secondary labels still resolve to 10–12px, which is too small on 2K/4K displays at low OS scaling;
- catalog/tracker grids keep desktop-era column counts instead of using the extra workspace;
- poster source sizing assumes ~205px cards even when the visual card can become larger.

The goal is **not** to zoom the entire UI. Global `transform: scale()`, browser-style zoom and blanket rem conversion are explicitly forbidden.

The goal is a tiered desktop design system where layout, typography, spacing and media sizes grow independently and remain bounded.

---

## 1. Responsive desktop tiers

Use CSS viewport dimensions, not marketing labels such as “4K monitor”.

The new layer must support these practical tiers:

- baseline desktop: existing rules below 1500px;
- wide desktop: >= 1500px and sufficient height;
- XL desktop: >= 1920px;
- 2K/large canvas: >= 2400px;
- ultra-wide / 4K CSS canvas: >= 3000px;
- very large 4K canvas: >= 3400px and >= 1500px height.

Width is always paired with a height guard on the large tiers so a short ultrawide window does not receive oversized vertical rhythm.

Windows display scaling is naturally respected because CSS viewport pixels already reflect browser/OS scaling.

---

## 2. Large-screen design tokens

Extend the existing root readability stylesheet (`patch16-6-2-readability-2k-density.css`) with a single large-screen token contract. This is intentional: the new rules replace/upgrade the older 2K/4K block instead of adding another root stylesheet, so the root CSS import/source budgets do not regress:

### Layout
- `--ab-ls-sidebar-width`
- `--ab-ls-topbar-height`
- `--ab-ls-page-max`
- `--ab-ls-page-inline`
- `--ab-ls-main-gap`
- `--ab-ls-right-rail`

### Typography
Continue using the existing readability variables so the older readability selectors inherit the new values:

- `--ab-readable-body`
- `--ab-readable-small`
- `--ab-readable-micro`
- `--ab-ui-section-title`

Add:
- `--ab-ls-card-title`
- `--ab-ls-hero-title`
- `--ab-ls-panel-title`

### Spacing
- `--ab-ls-section-gap`
- `--ab-ls-card-gap`
- `--ab-ls-panel-padding`

The existing readability layer remains in its current root cascade position, while the older large-screen block inside it is replaced by the 18.5.5.1 contract. This keeps cascade ownership stable and avoids a 77th root CSS import.

---

## 3. Shell geometry

At large widths:

- sidebar expands gradually, not proportionally;
- topbar left offset always matches sidebar width;
- app-shell margin always matches sidebar width;
- topbar height increases only slightly;
- page-content grows to use real workspace instead of staying near 1440–1980px;
- page-content remains centered and capped so reading widths never become edge-to-edge.

Target content maxima:

- 1500+: ~1680px;
- 1920+: ~1880px;
- 2400+: ~2180px;
- 3000+: ~2480px;
- 3400+: ~2720px.

The page still keeps generous outer breathing room on very large canvases.

---

## 4. Home layout

### Main/right columns

Right rail should scale approximately:

- wide: 300px;
- XL: 330px;
- 2K+: 360px;
- 3000+: 380px;
- 3400+: 400px.

Main gap grows modestly from ~22px to ~30px.

The right rail remains one vertical column; the existing desktop stability contract is preserved.

### Hero

The hero must stop looking like a small banner on a 2K/4K screen.

Scale only on wide desktop:

- min-height grows in bounded tiers;
- content padding grows;
- title font grows with hard caps;
- content measure stays bounded;
- controls/nav move proportionally;
- backdrop quality remains stable.

No mobile/tablet hero behavior changes.

### Recommendation rails

Extra width should reveal more recommendations instead of simply making five giant posters.

- Smart recommendation cards grow slightly but stay bounded;
- standard home anime rails show more cards at larger tiers;
- rail arrows and hit targets stay usable;
- existing virtualization/backpressure remains unchanged.

---

## 5. Catalog and tracker density

At large desktop widths, replace the legacy fixed five-column catalog/tracker behavior with tiered column counts:

- 1500+: 6 columns;
- 1920+: 7 columns;
- 2400+: 8 columns;
- 3000+: 9 columns;
- 3400+: 10 columns where the route width allows it.

Cards must never become extremely wide.

Search/tracker route wrappers are allowed to use the large page canvas instead of remaining capped near 1220px.

This applies only to desktop tiers; tablet/mobile contracts remain untouched.

---

## 6. Typography floors

Important readable UI must not remain 8–9px on large desktops.

At large-screen tiers increase:

- sidebar nav/secondary copy;
- topbar search/actions;
- section headings and section links;
- card titles/meta/state/rating;
- Top Anime title/meta/rank;
- upcoming episode title/meta/countdown;
- panel headings;
- generic page heading/supporting text;
- detail metadata and descriptions;
- tracker/search controls.

Decorative micro badges may remain compact, but semantic text must observe the readability tokens.

Typography growth is capped; a 4K display must not turn the product into tablet UI.

---

## 7. Right rail readability

For Top Anime and Upcoming Episodes:

- poster widths/heights increase in large tiers;
- row vertical rhythm increases;
- title font grows;
- metadata grows;
- rail panel width grows with the shell;
- names still clamp at two lines;
- no horizontal overflow.

---

## 8. Responsive poster source sizes

Large-screen CSS without media-source updates can make posters look soft.

Update the `sizes` hints for:

- `AnimeCard`;
- `SmartRecommendationCard`.

Add explicit large viewport hints before the current fallback so the browser may select 360/540/720 variants when the card is visually larger.

Do not change quality presets or force every card to 720px.

---

## 9. Route safety

The large-screen layer must not break:

- mobile bottom navigation;
- tablet portrait/landscape;
- compact landscape phones;
- Watch Together theater shell;
- profile route-only CSS ownership;
- anime route-only CSS ownership;
- light theme;
- Telegram Mini App;
- 18.5.5.0 near-viewport image warmup;
- 18.5.5.0.1 media reliability shield.

Use selectors scoped to desktop media queries and avoid changes below 1500px.

---

## 10. Performance constraints

The patch is CSS-first.

Forbidden:

- JS resize listeners;
- hydration based on screen width;
- global UI scaling transforms;
- loading extra components only for 4K;
- extra image requests caused by layout code.

Allowed:

- CSS custom properties;
- media queries;
- responsive `sizes` hints;
- existing responsive image variants.

No new database migration, API route or runtime worker is required.

---

## 11. Regression matrix

Add `patch18-5-5-1:check` and protect:

- stylesheet import order;
- all large-screen breakpoints;
- page max-width progression;
- sidebar/topbar/app-shell geometry coupling;
- right rail width progression;
- hero bounded scaling;
- catalog/tracker column progression;
- readable typography floors;
- no `transform: scale()` or `zoom` based large-screen solution;
- AnimeCard / SmartRecommendationCard large-screen `sizes` hints;
- home right rail remains one column;
- mobile breakpoint files remain untouched;
- existing readability density contract remains imported;
- near-viewport media loading remains enabled.

Recommended visual matrix for manual smoke:

- 1280×720;
- 1366×768;
- 1440×900;
- 1920×1080;
- 2560×1440;
- 3440×1440;
- 3840×2160;
- 2560×1440 at 125/150% OS scaling;
- 3840×2160 at 125/150% OS scaling.

---

## Expected result

At 2K/4K, AnimeBox should look like a product designed for that canvas:

- content uses substantially more of the screen;
- text stays comfortably readable;
- hero and right rail have proper visual weight;
- more cards are visible rather than five cards becoming enormous;
- no dead-space “tiny website in the middle” effect;
- mobile and ordinary desktop remain visually unchanged.
