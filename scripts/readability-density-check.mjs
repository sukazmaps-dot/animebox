import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const layout = read('app/layout.tsx');
const css = read('app/patch16-6-2-readability-2k-density.css');
const telegram = read('components/TelegramPromoCard.tsx');

const importNeedle = "import './patch16-6-2-readability-2k-density.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: 16.6.2 stylesheet is not imported.');
}

const previousImport = "import './patch16-6-1-mobile-performance.css';";
if (layout.indexOf(importNeedle) < layout.indexOf(previousImport)) {
  failures.push('layout.tsx: 16.6.2 must remain the final CSS override layer.');
}

for (const [label, needle] of [
  ['wide desktop contract', '@media (min-width: 1500px) and (min-height: 760px)'],
  ['2K desktop contract', '@media (min-width: 1920px) and (min-height: 900px)'],
  ['4K desktop contract', '@media (min-width: 2400px) and (min-height: 1100px)'],
  ['wide content token', '--ab-wide-content: 1800px'],
  ['2K card title size', '.anime-card__body h3'],
  ['2K comment readability', '.episode-comment__body'],
  ['2K sidebar readability', '.sidebar__item'],
  ['Telegram content-owned height', 'height: fit-content !important'],
  ['Telegram compact height reset', '.telegram-growth-card--compact.telegram-growth-card--vector'],
  ['Telegram community height reset', '.telegram-growth-card--community.telegram-growth-card--vector'],
  ['mobile Telegram contract', '@media (max-width: 760px)'],
]) {
  if (!css.includes(needle)) {
    failures.push(`16.6.2 CSS: missing ${label}.`);
  }
}

if (!telegram.includes('telegram-growth-card--compact') || !telegram.includes('telegram-growth-card--community')) {
  failures.push('TelegramPromoCard: expected compact/community placement classes are missing.');
}

if (/transform:\s*scale\([^)]*[1-9][.]?[2-9]/.test(css)) {
  failures.push('16.6.2 CSS: large-screen readability must not use global-style UI scaling.');
}

if (failures.length) {
  console.error('[AnimeBox Readability & 2K Density] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: 1440p/2K/4K readability, content width and Telegram promo density');
