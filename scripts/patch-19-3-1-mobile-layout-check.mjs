import fs from 'node:fs';

const welcome = fs.readFileSync('components/TelegramWelcomePromo.tsx', 'utf8');
const growthCss = fs.readFileSync('app/patch11-growth.css', 'utf8');
const theaterCss = fs.readFileSync('components/watch-party/WatchTogetherTheater.module.css', 'utf8');
const panelCss = fs.readFileSync('components/watch-party/WatchPartyPanel.module.css', 'utf8');

for (const needle of [
  'brandImageFailed',
  'unoptimized',
  'onError={() => setBrandImageFailed(true)}',
  'registration-welcome__logo-fallback',
]) {
  if (!welcome.includes(needle) && !growthCss.includes(needle)) {
    throw new Error(`Patch 19.3.1 welcome fallback missing: ${needle}`);
  }
}

for (const needle of [
  'max-height: 100dvh',
  'overflow-y: auto',
  'env(safe-area-inset-bottom)',
  'registration-welcome__continue > b',
]) {
  if (!growthCss.includes(needle)) {
    throw new Error(`Patch 19.3.1 welcome mobile layout missing: ${needle}`);
  }
}

for (const needle of [
  'height: auto',
  'min-height: 100dvh',
  'overflow-y: auto !important',
  'grid-template-rows: minmax(245px, 44dvh) auto',
  'grid-template-columns: repeat(2, minmax(0, 1fr))',
  'min-height: 40px',
]) {
  if (!theaterCss.includes(needle)) {
    throw new Error(`Patch 19.3.1 theater scroll/nav invariant missing: ${needle}`);
  }
}

for (const needle of [
  "min-height: clamp(270px, 36dvh, 380px)",
  'grid-template-columns: repeat(3, minmax(0, 1fr))',
  'min-height: 42px',
  'padding: 9px 8px',
  'padding-bottom: max(8px, env(safe-area-inset-bottom))',
]) {
  if (!panelCss.includes(needle)) {
    throw new Error(`Patch 19.3.1 watch party panel invariant missing: ${needle}`);
  }
}

console.log('Patch 19.3.1 mobile layout precision invariants OK');
