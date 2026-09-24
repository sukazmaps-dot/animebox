import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('components/HomePageClient.tsx');
const support = read('components/monetization/SupportAnimeBox.tsx');
const css = read('app/patch17-4-2-ui-precision.css');

const failures = [];

for (const [label, source] of [
  ['collection', home],
  ['support', support],
]) {
  for (const needle of [
    'home-service-card__head',
    'home-service-card__icon',
    'home-service-card__eyebrow',
    'home-service-card__copy',
    'home-service-card__action',
  ]) {
    if (!source.includes(needle)) {
      failures.push(`${label} service card is missing ${needle}`);
    }
  }
}

if (!home.includes('Открыть трекер <span aria-hidden="true">↗</span>')) {
  failures.push('collection CTA is not using the unified action pattern');
}

if (!support.includes('Подробнее <span aria-hidden="true">↗</span>')) {
  failures.push('support CTA is not using the unified action pattern');
}

if (
  !css.includes('--ab-service-card-padding: 24px') ||
  !css.includes('--ab-service-card-radius: 16px') ||
  !css.includes('margin-top: auto !important')
) {
  failures.push('shared service-card spacing/action alignment contract is missing');
}

if (failures.length) {
  console.error('[AnimeBox UI Precision] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox UI Precision] shared service-card hierarchy passed.');
