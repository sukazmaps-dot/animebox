// UI Patch 26.0: route-specific, no JS data-path changes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('components/home/HomeScheduleSection.tsx');
const css = read('app/patch26-mobile-visual-geometry.css');
const layout = read('app/layout.tsx');
assert.match(home, /home-schedule--polished/);
assert.match(home, /role="group"/);
assert.match(home, /aria-label="Выбор дня выхода серий/);
assert.match(home, /home-schedule__swipe-hint/);
assert.match(css, /\.home-page \.home-schedule--polished \.schedule__tabs/);
assert.match(css, /overflow-x: auto !important/);
assert.match(css, /\.search-page \.anime-card\.anime-card \.anime-card__meta/);
assert.match(css, /height: auto !important/);
assert.doesNotMatch(css, /\.schedule-page-v2/);
assert.match(layout, /import '\.\/patch26-mobile-visual-geometry\.css';/);
console.log('PASS: UI Patch 26.0 schedule tabs and metadata geometry contract');
