/* Patch 32.6: exercise the real sparse-rail conditions and CSS ownership.
 * No external provider, fabricated recommendation ranking or network fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

const source = read('components/SmartRecommendationFeed.tsx');
const match = source.match(/const hideSparse =([\s\S]*?);\s*const compactSparse =([\s\S]*?);/);
assert(match, 'production sparse rail expressions must stay testable');
const evaluate = new Function('input', `
  const { items, hasMore, exhausted, loading, failed, skeleton } = input;
  const rail = { id: 'continuation' };
  const displayItems = Array.from({length: items}, (_, index) => ({anime:{id:index+1}}));
  const exhaustedRails = new Set(exhausted ? [rail.id] : []);
  const railLoading = loading;
  const railFailed = failed;
  const showRailSkeleton = skeleton;
  const hideSparse = ${match[1]};
  const compactSparse = ${match[2]};
  return { hideSparse, compactSparse };
`);
const state = (items, more, options = {}) => evaluate({
  items, hasMore: more, exhausted: false, loading: false,
  failed: false, skeleton: false, ...options,
});

assert.deepEqual(state(1, false), { hideSparse: false, compactSparse: true },
  'single real recommendation must remain visible and compact');
assert.deepEqual(state(2, true, { exhausted: true }), { hideSparse: false, compactSparse: true },
  'locally exhausted two-card rail remains compact even when global pool has more');
assert.deepEqual(state(3, false), { hideSparse: false, compactSparse: false },
  'three real cards must not be silently removed');
assert.deepEqual(state(0, false), { hideSparse: true, compactSparse: false },
  'terminal empty row may hide without reserving a blank shelf');
assert.deepEqual(state(0, true, { exhausted: true }), { hideSparse: false, compactSparse: false },
  'empty recoverable rail must retain its manual retry');
assert.deepEqual(state(0, true, { loading: true, skeleton: true }), { hideSparse: false, compactSparse: false },
  'loading rail must not collapse its skeleton');
assert(source.includes('data-recommendation-visible-items={displayItems.length}') &&
  source.includes("data-recommendation-compact={compactSparse ? 'true' : 'false'}"));

const shell = read('components/home/HomePageShell.module.css');
assert(shell.includes('data-recommendation-compact="true"'), 'compact layout must have scoped styles');
const compactRule = shell.match(/\.page :global\(\.smart-feed__personal-rail\[data-recommendation-compact="true"\]\) \{([^}]+)\}/);
assert(compactRule, 'compact collection must have a scoped desktop rule');
for (const declaration of ['box-sizing: border-box', 'width: max-content', 'max-width: 100%', 'justify-self: start', 'grid-template-columns: minmax(160px, 210px) max-content']) {
  assert(compactRule[1].includes(declaration), 'compact collection must shrink to real content: ' + declaration);
}

assert(shell.includes('-webkit-mask-image: none; mask-image: none;'),
  'poster peeks must not be dimmed by an old dark edge mask');
assert(!/linear-gradient\(to right, transparent, #000 (?:20|24)px/.test(shell),
  'legacy poster edge masks must be removed, not overlaid');

const promo = read('components/home/HomeFooterPromos.module.css');
const community = read('components/home/HomeDeferredCommunity.tsx');
assert(promo.includes('.heading') && community.includes('className={styles.heading}'),
  'dismiss action must live inside a visible shared promo header');
assert(!promo.includes('padding-top: 54px') && !promo.includes('padding-right: 54px'),
  'do not reserve a detached promo close-button gap');
assert(community.includes('aria-label="Скрыть блок поддержки и Telegram"'),
  'keep accessible dismiss control');
assert(community.includes("window.localStorage.setItem(DISMISS_KEY, 'true')"),
  'keep persistent dismiss behavior');
console.log('PASS Patch 32.6.1: terminal sparse rails shrink to poster content, mobile card size and promos retained');
