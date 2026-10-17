# AnimeBox Patch 31.8 — Hero Copy and Layout Stability

**Status:** implementation in `fix/31-8-home-hero-copy-stability`, awaiting PR checks and physical-device verification.  
**Scope:** home carousel only, desktop typography/summary and inherited mobile constraints.  
**Baseline:** `main` @ `4df0fc9df753a5217d637933c0d0cb6a0e80f24b` (31.7.1, PR #249).  
**No migrations / Worker / environment changes.**

## 1. User-visible problem

On the home-page feature carousel, long anime titles can consume four to six lines and push the description, CTA row, and social link away from their intended location. The hero has a generous minimum height, but `height:auto` alone is not a substitute for bounded copy: each slide may have dramatically different visual geometry. Long words, very long localized names, narrow desktop columns, and browser text zoom make this more obvious.

Desired:
- Desktop feature title is at most **3 visible lines**; phone feature title remains at most **2 visible lines**.
- The entire accessible title remains in the DOM and the `title` attribute; no source-text cutting or route changes.
- Desktop description remains a short excerpt (`truncateSeoText(cleanSeoText(...), 160)` already does this), with a second **3-line CSS clamp**.
- Actions and social link remain below visible copy and **above pagination**, without overlap.
- The slide keeps the existing minimum-height contract; do **not** reintroduce `height: fixed` or `max-height` that cuts off buttons during browser zoom.
- Mobile hero still uses the existing full-bleed artwork, title scrim, 2-line clamp, primary/secondary CTAs, 44px targets and safe margins.

## 2. Root cause and owners

### Reproduce

1. Open `/` and select an anime whose Russian display name exceeds 55 characters; also test a 130–160-character name.
2. On 1440×900, 1920×1080 and 2560×1440, compare its hero against a 15-character title.
3. Inspect the computed properties of the `h1`: previously `display:block`, `overflow:visible`, `-webkit-line-clamp:unset` were inherited from `app/home-editorial-hero.css`.
4. Observe the CTA and summary descend when the title wraps.
5. Confirm phone widths are already clamped by `app/patch29-1-home-mobile.css` and should not be regressed.

### CSS ownership audit

- `components/HomeHeroCarousel.tsx`: source of the complete title, `is-long-title` classification, excerpt, actions, social link and pagination.
- `app/home-editorial-hero.css`: legacy visual foundation whose title deliberately removed the clamp. It is imported from `app/layout.tsx` *before* later home styles.
- `app/hero-teaser-v6.css`: earlier, lower-specificity 2-line title clamp that was subsequently overridden.
- `app/patch29-1-home-mobile.css`: source of truth for 2-line mobile title, content-sized mobile hero and landscape safe spacing.
- `app/patch30-1-home-visual.css`: page-scoped, last-imported desktop style; this is the correct owner for the final desktop title and excerpt. No new global CSS overlay should be added.
- `app/page.tsx`: imports route-scoped CSS in the order `home-visual-repair`, `patch29-1-home-mobile`, `patch30-0-home-streaming`, `patch30-1-home-visual`. The real hero wrapper has `home-page home-visual-v31`.

Crucial detail: the `!important` in `home-editorial-hero.css` cannot be defeated just with a later low-specificity declaration. The 31.8 title rule is scoped to the actual route root and uses the already established, more-specific desktop selector.

## 3. Implementation

### 3.1 Title, desktop ≥769px

In the existing rule
`.home-page.home-visual-v31 .home-grid .home-hero-carousel .home-hero-carousel__content h1`:
- `display: -webkit-box !important`
- `-webkit-box-orient: vertical !important`
- `-webkit-line-clamp: 3 !important`
- `overflow: hidden !important`
- `overflow-wrap: anywhere`
- `text-wrap: balance`
- `min-width: 0`

Do **not** replace the heading text with a JS substring. The existing responsive type scale and `is-long-title` lower-size treatment remain intact. `title={title}` remains present for pointer users; assistive technology reads the full heading text.

### 3.2 Summary, desktop ≥769px

In the existing `.home-hero-scene__summary` rule:
- Keep the existing width, margin, font and semantic paragraph.
- Change block to `display: -webkit-box !important`, `-webkit-line-clamp: 3 !important` and vertical box orientation.
- Use `overflow:hidden` and `max-height:4.65em` (3 × 1.55 line-height) as secondary safety rails.
- Keep line breaking tolerant of long words and non-spaced titles.

The excerpt cap of 160 characters remains; this change is layout-only and does not alter the source or SEO text.

### 3.3 Preserve actions, slide height and mobile

- Keep the hero `height:auto; min-height:520px` on ordinary desktop, `min-height:480px` on 769–1100px and `min-height:390px` at short desktop viewports. Increased user font-size is allowed to grow the slide, rather than clipping a control.
- Keep `padding-bottom` reserved for pagination, and the CTA social link within normal flow.
- Preserve the mobile `height:auto`, minimum height 380px–460px, safe top/bottom padding, two-line title clamp, mobile hidden summary, full-bleed art and the native safe-area rules.
- Do not modify images, source selection, image proxy, prefetch, carousel timer, autoplay unlock, recommendations, Telegram SDK or playback.

## 4. Automated verification

`scripts/home-hero-pagination-smoke.cjs` already runs as `npm run hero-pagination:browser` in AnimeBox Quality Gate. Extend **that existing browser matrix**, not a separate mocked CSS harness:

- Use the actual wrapper class `home-visual-v31`, so the real desktop style participates.
- A title longer than 130 characters, with `is-long-title`, and a realistic description paragraph.
- Width×height cases: 320×700, 360×800, 375×812, 390×844, 412×915, 430×932, 600×900, 768×1024, 844×390, 1024×520, 1440×900, 1920×1080, **2560×1440**.
- Dark and light themes, and selected slide 0, 2 and 4.
- Desktop: computed `h1` clamp **3**, `display:-webkit-box`, `overflow:hidden`; paragraph clamp **3**, `overflow:hidden`, paragraph height ≤ three computed line heights; CTA starts below paragraph.
- Mobile: computed `h1` clamp **2**, `overflow:hidden`; description hidden; artwork fills the hero.
- All viewports: no horizontal document overflow; pagination does not overlap social action; five visible targets ≥44×44; selected state correct; focus visible; counter correct; markers visible and minimum contrast 3:1.
- Reduced-motion fixture still disables nonessential animation; pagination React callbacks remain exercised by the original harness.
- Important limitation: this is Chromium with production CSS and a source-equivalent hero shell, not an authorized Telegram Mini App run and not a real network image test.

CI should also run TypeScript, lint, project prebuild, production build, targeted tests and CSS cascade ownership checks.

## 5. Manual device and accessibility checklist

| Case | Required outcome |
|---|---|
| 320, 360, 390, 412px portrait | ≤2 title lines; both buttons visible; no cropped letters or horizontal scrollbar |
| 844×390 rotated phone | desktop breakpoint does not overlap social/pagination; controls remain usable |
| 768px narrow tablet | mobile art and 2-line title still render over scrim |
| 769, 1024px desktop/tablet | 3-line title; excerpt 3 lines or fewer; CTA after excerpt |
| 1440, 1920, 2560px desktop | similar content geometry across short and long titles |
| Dark and light theme | legible text, artwork overlay, visible keyboard focus |
| 200% browser text zoom | hero may grow vertically but may not cut off interactive controls |
| Continuous 100+ character word / Cyrillic / Japanese title | wraps instead of widening viewport |
| Missing excerpt / missing metadata | no empty placeholder or broken action alignment |
| Failed/absent artwork | text and links remain usable against fallback surface |
| Telegram Android portrait and landscape | no WebView-specific clipping and no vertical gesture hijack |
| Actual device | test click, swipe, keyboard, theme switching, first-load LCP and layout shift |

## 6. Risk and rollback

Main risk: a higher-specificity global rule (or a future import-order change) could silently undo the desktop clamp. This is why the browser matrix now includes `home-visual-v31` and reads computed styles rather than checking selector presence.

Secondary risk: text zoom can require the hero to exceed its minimum height; that is acceptable. It must not hide actions or overlap pagination. The page should preserve keyboard navigation and reading order, and it must not suppress full content for accessibility.

No API, migration, storage, Worker, server config, service secret, cache schema, image transform or data-model change.

**Release gate:** green AnimeBox Quality Gate → PR review → merge only when approved → Railway deployment success on both services → smoke test on actual Chrome/Telegram. The PR itself is not a production release.
