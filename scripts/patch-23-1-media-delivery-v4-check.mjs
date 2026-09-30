import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const image = read('components/AnimeImage.tsx');
const media = read('lib/media-delivery.ts');
const warmup = read('lib/media-warmup-client.ts');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const worker = read('infra/cloudflare/media-worker.js');
const docs = read('docs/PATCH-23-1-MEDIA-DELIVERY-V4.md');

for (const [label, source, needle] of [
  ['media v4 version', media, "MEDIA_DELIVERY_VERSION = '23.1-media-v4'"],
  ['priority budget', media, 'MEDIA_CARD_PRIORITY_COUNT = 4'],
  ['catalog card sizes', media, 'MEDIA_ANIME_CARD_SIZES'],
  ['smart card sizes', media, 'MEDIA_SMART_CARD_SIZES'],
  ['smart mobile 162px cap', media, "'(max-width: 768px) 162px"],
  ['catalog landscape sizing', media, "'(orientation: landscape) and (max-height: 600px) 18vw"],
  ['card 240 variant', media, 'widths: [240, 360, 540, 720]'],
  ['warmup v4 version', warmup, "MEDIA_WARMUP_POLICY_VERSION = '23.1-warmup-v4'"],
  ['save-data horizontal budget', warmup, "'100px 48px 160px 48px'"],
  ['2g horizontal budget', warmup, "'180px 80px 260px 80px'"],
  ['3g horizontal budget', warmup, "'420px 360px 760px 360px'"],
  ['4g horizontal budget', warmup, "'700px 720px 1600px 720px'"],
  ['successful state cap', image, 'MAX_SUCCESSFUL_MEDIA_STATES = 640'],
  ['successful state cache', image, 'successfulMediaStateCache'],
  ['success cache read', image, 'readSuccessfulMediaState(sourcesKey)'],
  ['success cache remember', image, 'rememberSuccessfulMediaState('],
  ['success cache forget on error', image, 'forgetSuccessfulMediaState('],
  ['known poster bypasses near wait', image, 'loaded ||'],
  ['near high priority release', image, "fetchPriority === 'high' &&"],
  ['memory state diagnostic', image, 'data-image-memory-state='],
  ['generic card catalog sizes', animeCard, 'sizes={MEDIA_ANIME_CARD_SIZES}'],
  ['smart card home sizes', smartCard, 'sizes={MEDIA_SMART_CARD_SIZES}'],
  ['top match priority scope', smartCard, "rowId === 'top_match'"],
  ['top match priority count', smartCard, 'position <= MEDIA_CARD_PRIORITY_COUNT'],
  ['worker variant coalescing', worker, 'inFlightOriginFetches'],
  ['worker source coalescing', worker, 'inFlightSourceProbes'],
  ['worker stale cache', worker, 'stale-while-revalidate'],
  ['worker R2 first path', worker, 'const r2Hit = await readR2('],
  ['worker soft fail', worker, "status: 204"],
  ['docs contract', docs, 'Contract: `23.1-media-v4`'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if ((warmup.match(/new IntersectionObserver\(/g) ?? []).length !== 1) {
  failures.push('media warmup must still own exactly one IntersectionObserver');
}

if (image.includes('new IntersectionObserver(')) {
  failures.push('AnimeImage must not create a per-card IntersectionObserver');
}

if (
  animeCard.includes('loading="eager"') ||
  smartCard.includes('loading="eager"')
) {
  failures.push('mass card surfaces must not become globally eager');
}

if (/status\s*:\s*502/.test(worker)) {
  failures.push('media worker must not explicitly surface HTTP 502');
}

if (
  !image.includes('successfulMediaStateCache.size >') ||
  !image.includes('successfulMediaStateCache.delete(oldest)')
) {
  failures.push('successful poster cache is not bounded');
}

if (failures.length) {
  console.error('[AnimeBox Patch 23.1] Media Delivery V4 check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 23.1] bounded no-flash poster cache, shared sizing, priority budget, connection-aware warmup and worker shield passed.',
);
