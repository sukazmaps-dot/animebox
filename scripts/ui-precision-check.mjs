import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('components/home/HomePageShell.tsx');
const support = read('components/monetization/SupportAnimeBox.tsx');
const css = read('app/patch17-4-2-ui-precision.css');
const bannerCss = read('components/home/HomeSupportBanner.module.css');
const navbar = read('components/Navbar.tsx');

const failures = [];

for (const [label, source] of [
  ['support', support],
]) {
  for (const needle of [
    'homeBannerStyles.card',
    'homeBannerStyles.icon',
    'homeBannerStyles.eyebrow',
    'homeBannerStyles.copy',
    'homeBannerStyles.action',
  ]) {
    if (!source.includes(needle)) {
      failures.push(`${label} service card is missing ${needle}`);
    }
  }
}

// Home 32 removes duplicate footer navigation. The shared navbar retains
// tracker access; the compact support banner now owns its CSS locally.
if (!navbar.includes("href: '/list'") || !navbar.includes('href="/list"') || home.includes('aria-label="Разделы AnimeBox"')) {
  failures.push('shared navigation must retain tracker access without duplicate home navigation');
}
if (!bannerCss.includes('min-height: 44px') || !bannerCss.includes('.action:focus-visible') || !bannerCss.includes('min-width: 0')) failures.push('compact support banner must retain touch, keyboard and shrinking geometry');

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
