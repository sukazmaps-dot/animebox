import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const layout = read('app/layout.tsx');
const css = read('app/patch17-4-2-ui-precision.css');
const patchCss = css.slice(css.indexOf('/* Patch 21.2 — fluid reflow/readability */'));
const animeCard = read('components/AnimeCard.tsx');
const animeImage = read('components/AnimeImage.tsx');
const catalog = read('components/SearchCatalogClient.tsx');

const uiPrecisionImport = "import './patch17-4-2-ui-precision.css';";
if (!layout.includes(uiPrecisionImport)) {
  failures.push('layout: final UI precision stylesheet is not imported.');
}
if (layout.includes("import './patch21-2-global-frontend-readability.css';")) {
  failures.push('layout: Patch 21.2 must stay folded into the existing root CSS layer.');
}
if (!patchCss.startsWith('/* Patch 21.2 — fluid reflow/readability */')) {
  failures.push('Patch 21.2 folded CSS marker is missing.');
}

for (const [label, needle] of [
  ['fluid body typography', '--ab-fluid-body: clamp('],
  ['readable text measure', '--ab-readable-measure: 68ch'],
  ['fluid catalogue geometry', 'repeat(auto-fill,'],
  ['zoom-safe minimum', 'minmax(min(100%,var(--ab-card-min)),1fr)'],
  ['mobile one-rem contract', 'font-size:max(1rem,1em)!important'],
  ['long-title two-line contract', '-webkit-line-clamp: 2 !important'],
  ['overflow wrapping', 'overflow-wrap: anywhere'],
  ['promotional overflow guard', '.telegram-growth-card,.catalog-ad-break,.monetization-ad'],
]) {
  if (!css.includes(needle)) {
    failures.push(`Patch 21.2 CSS missing ${label}.`);
  }
}

if (/font-size\s*:\s*\d+(?:\.\d+)?px/i.test(patchCss)) {
  failures.push('Patch 21.2 CSS: font sizes must use relative units.');
}

if (/line-height\s*:\s*\d+(?:\.\d+)?px/i.test(patchCss)) {
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
