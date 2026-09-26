import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const animeImage = read('components/AnimeImage.tsx');
const cascade = read('components/AnimeImageCascade.tsx');
const imageService = read('lib/image-service.ts');
const mediaDelivery = read('lib/media-delivery.ts');
const mediaWorker = read('infra/cloudflare/media-worker.js');
const proxy = read('app/api/image/route.ts');
const hero = read('components/HomeHeroCarousel.tsx');
const anilist = read('lib/anilist.ts');
const smartHome = read('app/smart-home.css');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const continueWatching = read('components/HomeContinueWatching.tsx');
const scheduleItem = read('components/ScheduleItem.tsx');
const retentionHub = read('components/HomeRetentionHub.tsx');
const topAnime = read('components/TopAnimeItem.tsx');

const failures = [];

if (
  animeImage.includes("from 'next/image'") ||
  animeImage.includes('<Image')
) {
  failures.push('mass poster component must not use Next Image optimizer');
}

for (const needle of [
  'data-image-delivery="animebox-media"',
  'loading={nativeLoading}',
  'fetchPriority={nativeFetchPriority}',
  'data-image-loading={loading}',
  'data-image-warmup={warmupActivation}',
  'observeNearViewportMedia',
  'sourcePreference',
  'preset',
  'srcSet={sourceIndex === 0 ? mediaSrcSet : undefined}',
  'getImageMediaSrcSet',
  'data-image-preset={effectivePreset}',
  "nativeLoading !== 'eager'",
  'decoding="async"',
  'PRIMARY_MEDIA_TIMEOUT_MS = 6_500',
  'PROXY_SOURCE_TIMEOUT_MS = 9_500',
  'TRANSIENT_RETRY_MIN_DELAY_MS = 20_000',
  'TRANSIENT_RETRY_MAX_DELAY_MS = 45_000',
  'stableRetryDelayMs(sourcesKey)',
]) {
  if (!animeImage.includes(needle)) {
    failures.push(`AnimeImage missing ${needle}`);
  }
}

for (const forbidden of [
  'LOAD_WINDOW_ROOT_MARGIN',
  'new IntersectionObserver',
  'loading="eager"',
]) {
  if (animeImage.includes(forbidden)) {
    failures.push(`AnimeImage must not use per-card eager scheduling: ${forbidden}`);
  }
}

if (
  !imageService.includes('buildImageCandidateChain') ||
  !imageService.includes('buildAnimeBoxMediaCandidates(') ||
  !imageService.includes('const secondary = remote.find') ||
  !imageService.includes('const legacyProxy = proxyImageUrl(primary)') ||
  !imageService.includes("preference: ImageCandidatePreference = 'quality'") ||
  !imageService.includes('buildAnimeBoxMediaDefaultVariant') ||
  !imageService.includes('getImageMediaSrcSet') ||
  !imageService.includes("delivery.format ?? 'webp'") ||
  !imageService.includes('image.medium')
) {
  failures.push('image candidate chain is not media-first, variant-aware and bounded');
}

if (
  !mediaDelivery.includes('NEXT_PUBLIC_MEDIA_ORIGIN') ||
  !mediaDelivery.includes('NEXT_PUBLIC_MEDIA_RU_ORIGIN') ||
  !mediaDelivery.includes('buildAnimeBoxMediaCandidates') ||
  !mediaDelivery.includes('buildAnimeBoxMediaSrcSet') ||
  !mediaDelivery.includes("export type MediaImagePreset = 'tiny' | 'card' | 'large' | 'hero'") ||
  !mediaDelivery.includes('widths: [240, 360, 540, 720]') ||
  !mediaDelivery.includes('widths: [360, 540, 720, 1080]') ||
  !mediaDelivery.includes('MEDIA_IMAGE_WIDTHS') ||
  !mediaDelivery.includes('MEDIA_IMAGE_QUALITIES = [60, 70, 80]') ||
  !mediaDelivery.includes("format: MediaImageFormat = 'webp'") ||
  !mediaDelivery.includes("params.set('w'") ||
  !mediaDelivery.includes("params.set('q'") ||
  !mediaDelivery.includes("params.set('f'")
) {
  failures.push('AnimeBox media delivery variant/srcset builder is incomplete');
}

for (const needle of [
  'MEDIA_BUCKET',
  "requestUrl.pathname === '/health'",
  "requestUrl.pathname !== '/image'",
  'crypto.subtle.digest',
  'caches.default',
  'MAX_IMAGE_BYTES',
  "contentType.toLowerCase().startsWith('image/')",
  'BROWSER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60',
  'max-age=${BROWSER_CACHE_TTL_SECONDS}',
  'ALLOWED_WIDTHS',
  'ALLOWED_QUALITIES',
  'ALLOWED_FORMATS',
  "protocol: 'variants-v3'",
  "cf: {",
  "image,",
  "response.headers.get('cf-resized')",
  "'transform-not-applied'",
  'posters-v3/',
  'variant.token',
  'TRANSFORM_FALLBACK_TTL_SECONDS',

]) {
  if (!mediaWorker.includes(needle)) {
    failures.push(`Cloudflare media worker missing ${needle}`);
  }
}

for (const [label, source, preset] of [
  ['anime card', animeCard, 'card'],
  ['smart recommendation card', smartCard, 'card'],
  ['continue watching', continueWatching, 'tiny'],
  ['schedule item', scheduleItem, 'tiny'],
  ['retention hub', retentionHub, 'tiny'],
]) {
  if (!source.includes('sourcePreference="compact"')) {
    failures.push(`${label} must use compact poster sources`);
  }

  if (!source.includes(`preset="${preset}"`)) {
    failures.push(`${label} must use the ${preset} media preset`);
  }
}

if (
  !topAnime.includes("sourcePreference={editorial ? 'quality' : 'compact'}") ||
  !topAnime.includes("preset={editorial ? 'large' : 'tiny'}")
) {
  failures.push('Top Anime must keep editorial quality while compacting sidebar posters');
}

if (
  !smartHome.includes('Patch 18.1 — poster geometry invariants') ||
  !smartHome.includes('aspect-ratio: 2 / 3 !important') ||
  !smartHome.includes('position: absolute !important') ||
  !smartHome.includes('object-fit: cover !important')
) {
  failures.push('Smart Feed poster geometry is not locked to 2:3 cover slots');
}

if (
  !anilist.includes('?.medium ??') ||
  anilist.includes("medium:\n        media.coverImage\n          ?.large ??\n        media.coverImage\n          ?.extraLarge")
) {
  failures.push('AniList medium poster fallback is not mapped to the real medium URL');
}

if (
  !cascade.includes('buildImageCandidateChain(sources, {') ||
  !cascade.includes('getRawImageMediaSrcSet(') ||
  cascade.includes('proxyImageUrl(normalized)')
) {
  failures.push('AnimeImageCascade responsive media contract is incomplete');
}

if (
  !proxy.includes('function buildUpstreamHeaders') ||
  !proxy.includes("headers.Referer = 'https://shikimori.one/'") ||
  !proxy.includes("'Vercel-CDN-Cache-Control'") ||
  !proxy.includes("'Cloudflare-CDN-Cache-Control'") ||
  !proxy.includes("'X-AnimeBox-Image-Delivery': 'proxy-v2'") ||
  !proxy.includes('max-age=604800')
) {
  failures.push('legacy image proxy host-aware/cache contract is incomplete');
}

// Hero keeps the deliberate optimized-first remote image path for LCP.
if (
  !hero.includes("from 'next/image'") ||
  !hero.includes('unoptimized={Boolean(backdropAttempt?.unoptimized)}') ||
  !hero.includes('priority={safeActiveIndex === 0')
) {
  failures.push('hero LCP optimization/fallback contract was removed');
}

if (
  !hero.includes('priority={false}') ||
  !hero.includes('loading="lazy"') ||
  (hero.match(/fetchPriority=.*high/g) ?? []).length > 1
) {
  failures.push('mobile hero must not compete with the backdrop as a second high-priority LCP request');
}

if (
  animeImage.includes('PRIMARY_MEDIA_TIMEOUT_MS = 2_500') ||
  !animeImage.includes("nativeLoading !== 'eager'")
) {
  failures.push('poster watchdog regressed to mount-time lazy-image failover');
}

if (
  mediaWorker.includes('env.MEDIA_BUCKET.put(key, bytes') &&
  !mediaWorker.includes('if (variant && !origin.transformed)')
) {
  failures.push('variant fallback can poison R2 with an untransformed source image');
}

if (
  !animeImage.includes('quality,') ||
  !animeImage.includes('quality,\n        format,') ||
  !mediaDelivery.includes('normalizeMediaImageQuality')
) {
  failures.push('AnimeImage quality is not wired into the media transformation URL');
}

if (failures.length) {
  console.error('[AnimeBox Image Delivery] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Image Delivery] media edge + bounded fallback + poster geometry invariants passed.');
