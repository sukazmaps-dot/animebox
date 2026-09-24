import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const animeImage = read('components/AnimeImage.tsx');
const cascade = read('components/AnimeImageCascade.tsx');
const imageService = read('lib/image-service.ts');
const proxy = read('app/api/image/route.ts');
const hero = read('components/HomeHeroCarousel.tsx');
const anilist = read('lib/anilist.ts');

const failures = [];

if (
  animeImage.includes("from 'next/image'") ||
  animeImage.includes('<Image')
) {
  failures.push('mass poster component must not use Next Image optimizer');
}

for (const needle of [
  'data-image-delivery="direct-cdn"',
  'loading={loading}',
  'decoding="async"',
  'IMAGE_LOAD_TIMEOUT_MS = 6_000',
]) {
  if (!animeImage.includes(needle)) {
    failures.push(`AnimeImage missing ${needle}`);
  }
}

if (
  !imageService.includes('buildImageCandidateChain') ||
  !imageService.includes('prefersImageProxy') ||
  !imageService.includes("host.endsWith('.shikimori.one')") ||
  !imageService.includes('const primaryDirect = originals.find')
) {
  failures.push('image candidate chain is not host-aware/direct-first');
}

if (
  !anilist.includes('?.medium ??') ||
  anilist.includes("medium:\n        media.coverImage\n          ?.large ??\n        media.coverImage\n          ?.extraLarge")
) {
  failures.push('AniList medium poster fallback is not mapped to the real medium URL');
}

if (
  !cascade.includes('buildImageCandidateChain(sources)') ||
  cascade.includes('proxyImageUrl(normalized)')
) {
  failures.push('AnimeImageCascade still fans out proxy attempts');
}

if (
  !proxy.includes('function buildUpstreamHeaders') ||
  !proxy.includes("headers.Referer = 'https://shikimori.one/'") ||
  !proxy.includes("'Vercel-CDN-Cache-Control'") ||
  !proxy.includes("'Cloudflare-CDN-Cache-Control'") ||
  !proxy.includes("'X-AnimeBox-Image-Delivery': 'proxy-v2'")
) {
  failures.push('image proxy host-aware/cache contract is incomplete');
}

// Hero keeps the only deliberate optimized-first remote image path for LCP,
// and already has an unoptimized fallback when the optimizer is unavailable.
if (
  !hero.includes("from 'next/image'") ||
  !hero.includes('unoptimized={Boolean(backdropAttempt?.unoptimized)}') ||
  !hero.includes('priority={safeActiveIndex === 0')
) {
  failures.push('hero LCP optimization/fallback contract was removed');
}

if (failures.length) {
  console.error('[AnimeBox Image Delivery] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Image Delivery] direct poster delivery + hero LCP invariants passed.');
