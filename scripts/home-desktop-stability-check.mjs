import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const css = read('app/patch16-6-6-home-desktop-stability.css');
const layout = read('app/layout.tsx');
const legacy = read('app/design-v2-content-first.css');
const perf = read('app/patch16-6-1-mobile-performance.css');

for (const [label, needle] of [
  ['desktop contract', '@media (min-width: 1001px)'],
  ['right rail one column', '.home-page .right-rail'],
  ['Top Anime one-column reset', '.home-page .home-top-anime-panel .panel__body'],
  ['Upcoming one-column reset', '.home-page .home-upcoming-panel__list'],
  ['utility one-column reset', '.home-page .home-utility-grid'],
  ['right rail containment reset', 'content-visibility: visible !important'],
  ['right rail intrinsic reset', 'contain-intrinsic-size: none !important'],
  ['smart recommendation density', '.home-page .smart-feed__slide'],
]) {
  if (!css.includes(needle)) failures.push(`16.6.6 CSS: missing ${label}.`);
}

if (!legacy.includes('grid-template-columns: repeat(5, minmax(0, 1fr))')) {
  failures.push('Legacy upcoming-grid contract changed; review whether the 16.6.6 override is still necessary.');
}

if (!perf.includes('.right-rail > .panel')) {
  failures.push('Mobile performance containment contract changed; review the desktop exemption.');
}

const importNeedle = "import './patch16-6-6-home-desktop-stability.css';";
const previousImport = "import './patch16-6-5-profile-studio-gate.css';";

if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: 16.6.6 stylesheet is not imported.');
} else if (layout.indexOf(importNeedle) < layout.indexOf(previousImport)) {
  failures.push('layout.tsx: 16.6.6 must remain the final CSS override layer.');
}

if (failures.length) {
  console.error('[AnimeBox Desktop Home Stability] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: desktop right rail and recommendation density contracts are stable');
