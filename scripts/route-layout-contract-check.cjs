/** Static guard for semantic tracker-progress colors; runs in prebuild. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('app/list/page.tsx', 'utf8');
const start = source.indexOf('{item.progress && item.progress.trackedEpisodes > 0 && (');
const end = source.indexOf('className="tracker-card__controls', start);
assert(start >= 0 && end > start, 'Tracker progress JSX block must be present');
const progress = source.slice(start, end);
for (const [name, marker] of [
  ['semantic progress text', 'text-[var(--ab-ui-text)]'],
  ['semantic progress subtitle', 'text-[var(--ab-ui-muted)]'],
  ['semantic progress count', 'text-[var(--ab-ui-accent)]'],
  ['theme-aware progress rail', 'bg-[var(--ab-ui-border)]'],
  ['minimum 44px resume touch target', 'min-h-11'],
]) assert(progress.includes(marker), 'Missing ' + name);
assert(!/text-white(?:\/\d+)?|bg-white\/\[0\.055\]|text-\[color-mix\(in_srgb,var\(--ab-ui-accent\)_\d+%,transparent\)\]/.test(progress),
  'Theme-invariant white/transparent progress styling has reappeared');
const responsive=fs.readFileSync('app/patch12-4-1-mobile-anime-flow.css','utf8');
assert(/\.tracker-page\s+\.tracker-card__progress\s+a\s*\{\s*min-height:\s*44px\s*!important/.test(responsive),
  'Legacy mobile CSS must preserve a 44px resume touch target');
const hero=fs.readFileSync('components/HomeHeroCarousel.tsx','utf8');
assert(hero.includes('<HomeHeroPagination'), 'Hero must use the isolated pagination component');
assert(!/home-hero-carousel__(?:dot|dots|counter|nav)/.test(hero),
  'Legacy hero pagination classes must not regain ownership of the live controls');
for (const file of ['scripts/route-layout-matrix-smoke.cjs', 'docs/PATCH-29-14-ROUTE-VISUAL-STABILITY.md']) {
  assert(fs.existsSync(file), 'Missing route layout contract: ' + file);
}
console.log('[Patch 29.14] Tracker progress uses semantic theme colors and accessible resume target.');
