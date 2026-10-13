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
assert.match(home, /styles\.swipeHint/);
assert.match(homeCss, /\.root\.root :global\(\.schedule__tabs\)/);
assert.match(homeCss, /overflow-x: auto !important/);
assert.match(cardCss, /:global\(\.search-page\) \.content\.content :global\(\.anime-card__meta\)/);
assert.match(cardCss, /height: auto !important/);
assert.doesNotMatch(layout, /patch26-mobile-visual-geometry/);
console.log('PASS: UI Patch 26.0 component-local mobile geometry contract');
