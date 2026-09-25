import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const warmup = read('lib/media-warmup-client.ts');
const animeImage = read('components/AnimeImage.tsx');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const layout = read('app/layout.tsx');
const media = read('lib/media-delivery.ts');

const failures = [];

for (const needle of [
  'let observer: IntersectionObserver | null = null',
  'new IntersectionObserver(',
  'callbacks = new WeakMap',
  "connection?.saveData",
  "effectiveType === 'slow-2g'",
  "effectiveType === '2g'",
  "effectiveType === '3g'",
  "'700px 900px 1600px 900px'",
  "'100px 80px 160px 80px'",
  "callback?.('warm')",
  "callback('native-lazy')",
]) {
  if (!warmup.includes(needle)) {
    failures.push(`shared media warmup missing: ${needle}`);
  }
}

if ((warmup.match(/new IntersectionObserver\(/g) ?? []).length !== 1) {
  failures.push('media warmup must own exactly one shared IntersectionObserver implementation');
}

if (animeImage.includes('new IntersectionObserver(')) {
  failures.push('AnimeImage must not instantiate a per-card IntersectionObserver');
}

for (const needle of [
  "loading?: 'lazy' | 'eager' | 'near'",
  "loading !== 'near' || warmupActivation !== 'waiting'",
  "warmupActivation === 'native-lazy'",
  "loading === 'near' ? 'low' : fetchPriority",
  'observeNearViewportMedia(host',
  'shouldRequestSource && (',
  'loading={nativeLoading}',
  'fetchPriority={nativeFetchPriority}',
  'srcSet={sourceIndex === 0 ? mediaSrcSet : undefined}',
  'sizes={sizes}',
  'decoding="async"',
  'duration-[180ms]',
]) {
  if (!animeImage.includes(needle)) {
    failures.push(`AnimeImage near mode missing: ${needle}`);
  }
}

if (
  !animeCard.includes('loading="near"') ||
  !smartCard.includes('loading="near"')
) {
  failures.push('mass AnimeCard and SmartRecommendationCard posters must use near mode');
}

if (
  !layout.includes('const mediaPreconnectOrigin = getPrimaryMediaOrigin()') ||
  !layout.includes('rel="preconnect"') ||
  !layout.includes('href={mediaPreconnectOrigin}') ||
  !layout.includes('crossOrigin="anonymous"')
) {
  failures.push('root layout is missing bounded primary media preconnect');
}

if ((layout.match(/rel="preconnect"/g) ?? []).length !== 1) {
  failures.push('root layout must not fan out media preconnects');
}

if (
  !media.includes('widths: [240, 360, 540, 720]') ||
  !media.includes('MEDIA_IMAGE_QUALITIES = [60, 70, 80]')
) {
  failures.push('responsive media card quality ladder regressed');
}

for (const needle of [
  'MAX_RAIL_DOM_ITEMS = 36',
  'RAIL_VIRTUAL_OVERSCAN = 6',
  'virtualMaxItems={MAX_RAIL_DOM_ITEMS}',
]) {
  if (!feed.includes(needle)) {
    failures.push(`feed virtualization/backpressure regressed: ${needle}`);
  }
}

if (animeCard.includes('loading="eager"') || smartCard.includes('loading="eager"')) {
  failures.push('mass card grids must not be globally eager');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.0 Media Warmup] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.0 Media Warmup] shared adaptive near-viewport scheduling, responsive delivery and feed budget invariants passed.',
);
