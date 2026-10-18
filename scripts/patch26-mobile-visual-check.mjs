// UI Patch 26.0: no extra root CSS imports or search data-path changes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('components/home/HomeScheduleSection.tsx');
const homeCss = read('components/home/HomeScheduleSection.module.css');
const cardCss = read('components/AnimeCardContent.module.css');
const layout = read('app/layout.tsx');
assert.match(home, /styles\.root/);
assert.match(home, /role="group"/);
assert.match(home, /aria-label="Выбор дня выхода серий/);
// Home 32 owns the schedule in a CSS Module. Its group label now carries
// the swipe instruction; the hidden visual hint and specificity escalation
// from Patch 26 are no longer part of the layout contract.
assert.match(home, /aria-label="Выбор дня выхода серий\. Прокручивается горизонтально"/);
const tabsRule = homeCss.match(/\.root :global\(\.schedule__tabs\)\s*\{([^}]+)\}/)?.[1];
assert.ok(tabsRule, 'Schedule tabs must retain their component-local rule');
assert.match(tabsRule, /display:\s*flex\s*;/);
assert.match(tabsRule, /overflow-x:\s*auto\s*;/);
assert.match(tabsRule, /scroll-snap-type:\s*x proximity\s*;/);
assert.match(homeCss, /\.root :global\(\.schedule__tab\)\s*\{[^}]*flex:\s*0 0 auto\s*;/);
assert.match(homeCss, /\.root :global\(\.schedule__tab\)\s*\{[^}]*min-height:\s*44px\s*;/);
assert.match(cardCss, /:global\(\.search-page\) \.content\.content :global\(\.anime-card__meta\)/);
assert.match(cardCss, /height: auto !important/);
assert.doesNotMatch(layout, /patch26-mobile-visual-geometry/);
console.log('PASS: UI Patch 26.0 component-local mobile geometry contract');
