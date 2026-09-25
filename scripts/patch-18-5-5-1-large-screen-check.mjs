import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const layout = read('app/layout.tsx');
const css = read('app/patch16-6-2-readability-2k-density.css');
const legacyReadability = read('app/patch16-6-2-readability-2k-density.css');
const homeStability = read('app/patch16-6-6-home-desktop-stability.css');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const hero = read('components/HomeHeroCarousel.tsx');

const importNeedle = "import './patch16-6-2-readability-2k-density.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout: shared readability/large-screen stylesheet is not imported');
}

if (layout.includes("import './patch18-5-5-1-large-screen.css';")) {
  failures.push('layout: 18.5.5.1 must stay folded into the existing root readability layer');
}

for (const [label, needle] of [
  ['wide tier', '@media (min-width: 1500px) and (min-height: 760px)'],
  ['XL tier', '@media (min-width: 1920px) and (min-height: 900px)'],
  ['2K tier', '@media (min-width: 2400px) and (min-height: 1100px)'],
  ['3000 tier', '@media (min-width: 3000px) and (min-height: 1300px)'],
  ['4K tier', '@media (min-width: 3400px) and (min-height: 1500px)'],
  ['sidebar token', '--ab-ls-sidebar-width'],
  ['topbar token', '--ab-ls-topbar-height'],
  ['page max token', '--ab-ls-page-max'],
  ['right rail token', '--ab-ls-right-rail'],
  ['card title token', '--ab-ls-card-title'],
  ['hero title token', '--ab-ls-hero-title'],
  ['1680 canvas', '--ab-ls-page-max: 1680px'],
  ['1880 canvas', '--ab-ls-page-max: 1880px'],
  ['2180 canvas', '--ab-ls-page-max: 2180px'],
  ['2480 canvas', '--ab-ls-page-max: 2480px'],
  ['2720 canvas', '--ab-ls-page-max: 2720px'],
  ['300 rail', '--ab-ls-right-rail: 300px'],
  ['330 rail', '--ab-ls-right-rail: 330px'],
  ['360 rail', '--ab-ls-right-rail: 360px'],
  ['380 rail', '--ab-ls-right-rail: 380px'],
  ['400 rail', '--ab-ls-right-rail: 400px'],
  ['shell coupling sidebar', 'margin-left: var(--ab-ls-sidebar-width)'],
  ['shell coupling topbar', 'left: var(--ab-ls-sidebar-width)'],
  ['shell coupling height', 'padding-top: var(--ab-ls-topbar-height)'],
  ['hero large geometry', '.home-grid .page-hero.home-hero-carousel'],
  ['hero bounded copy', 'max-width: 1100px !important'],
  ['catalog six columns', 'repeat(6, minmax(0, 1fr))'],
  ['catalog seven columns', 'repeat(7, minmax(0, 1fr))'],
  ['catalog eight columns', 'repeat(8, minmax(0, 1fr))'],
  ['catalog nine columns', 'repeat(9, minmax(0, 1fr))'],
  ['catalog ten columns', 'repeat(10, minmax(0, 1fr))'],
  ['right rail one column', 'grid-template-columns: minmax(0, 1fr) !important'],
]) {
  if (!css.includes(needle)) {
    failures.push(`large-screen CSS missing ${label}: ${needle}`);
  }
}

if (/\bzoom\s*:/.test(css)) {
  failures.push('large-screen CSS must not use browser-style zoom');
}

if (/transform\s*:\s*scale\(/.test(css)) {
  failures.push('large-screen CSS must not solve layout with transform: scale()');
}

for (const [label, source, needle] of [
  ['AnimeCard 1920 size', animeCard, '(min-width: 1920px) 215px'],
  ['AnimeCard 2400 size', animeCard, '(min-width: 2400px) 225px'],
  ['AnimeCard 3000 size', animeCard, '(min-width: 3000px) 235px'],
  ['AnimeCard 3400 size', animeCard, '(min-width: 3400px) 250px'],
  ['Smart card 1920 size', smartCard, '(min-width: 1920px) 215px'],
  ['Smart card 3400 size', smartCard, '(min-width: 3400px) 250px'],
  ['Hero 1920 source', hero, '(min-width: 1920px) 1500px'],
  ['Hero 2400 source', hero, '(min-width: 2400px) 1750px'],
  ['Hero 3000 source', hero, '(min-width: 3000px) 1950px'],
  ['Hero 3400 source', hero, '(min-width: 3400px) 2100px'],
  ['AnimeCard near loading', animeCard, 'loading="near"'],
  ['Smart card near loading', smartCard, 'loading="near"'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label} missing: ${needle}`);
  }
}

if (!legacyReadability.includes('--ab-readable-small')) {
  failures.push('legacy readability token contract disappeared');
}

if (
  !homeStability.includes('.home-page .right-rail') ||
  !homeStability.includes('grid-template-columns: minmax(0, 1fr) !important')
) {
  failures.push('desktop right-rail stability contract regressed');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.1 Large Screen] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.1 Large Screen] tiered desktop canvas, readable typography, bounded hero/rails and responsive media sizing passed.',
);
