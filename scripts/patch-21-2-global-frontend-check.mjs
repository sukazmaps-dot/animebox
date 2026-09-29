import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const layout = read('app/layout.tsx');
const css = read('app/patch21-2-global-frontend-readability.css');
const animeCard = read('components/AnimeCard.tsx');
const animeImage = read('components/AnimeImage.tsx');
const catalog = read('components/SearchCatalogClient.tsx');

const importNeedle =
  "import './patch21-2-global-frontend-readability.css';";

if (!layout.includes(importNeedle)) {
  failures.push('layout: Patch 21.2 root stylesheet is not imported.');
}

const uiPrecisionImport = "import './patch17-4-2-ui-precision.css';";
if (layout.indexOf(importNeedle) < layout.indexOf(uiPrecisionImport)) {
  failures.push('layout: Patch 21.2 must remain the final root CSS override.');
}

for (const [label, needle] of [
  ['fluid body typography', '--ab-fluid-body: clamp('],
  ['readable text measure', '--ab-readable-measure: 68ch'],
  ['wide readable text measure', '--ab-readable-measure-wide: 75ch'],
  ['fluid catalogue geometry', 'repeat(\n      auto-fill,'],
  ['zoom-safe minimum', 'minmax(min(100%, var(--ab-catalog-card-min)), 1fr)'],
  ['mobile one-rem contract', 'font-size: 1rem !important'],
  ['long-title two-line contract', '-webkit-line-clamp: 2 !important'],
  ['overflow wrapping', 'overflow-wrap: anywhere'],
  ['telegram content height', 'block-size: fit-content !important'],
  ['safe-area page padding', 'env(safe-area-inset-left, 0rem)'],
]) {
  if (!css.includes(needle)) {
    failures.push(`Patch 21.2 CSS missing ${label}.`);
  }
}

if (/font-size\s*:\s*\d+(?:\.\d+)?px/i.test(css)) {
  failures.push('Patch 21.2 CSS: font sizes must use relative units.');
}

if (/line-height\s*:\s*\d+(?:\.\d+)?px/i.test(css)) {
  failures.push('Patch 21.2 CSS: line heights must not use fixed pixels.');
}

for (const [label, needle] of [
  ['AnimeCard loading prop', "imageLoading?: 'lazy' | 'eager' | 'near'"],
  ['AnimeCard fetch-priority prop', "imageFetchPriority?: 'high' | 'low' | 'auto'"],
  ['AnimeCard format negotiation', 'format="auto"'],
]) {
  if (!animeCard.includes(needle)) {
    failures.push(`${label} missing.`);
  }
}

for (const [label, needle] of [
  ['AVIF source', 'type="image/avif"'],
  ['WebP source', 'type="image/webp"'],
  ['picture element', '<picture className="contents">'],
  ['AVIF srcset generation', "'avif'"],
  ['WebP srcset generation', "'webp'"],
]) {
  if (!animeImage.includes(needle)) {
    failures.push(`AnimeImage: ${label} missing.`);
  }
}

for (const [label, needle] of [
  ['catalog eager first two', "imageLoading={index < 2 ? 'eager' : 'near'}"],
  ['catalog high priority first two', "imageFetchPriority={index < 2 ? 'high' : 'low'}"],
]) {
  if (!catalog.includes(needle)) {
    failures.push(`SearchCatalogClient: ${label} missing.`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21.2] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'PASS: Patch 21.2 fluid typography, zoom-safe reflow, adaptive catalogue and AVIF/WebP delivery',
);
