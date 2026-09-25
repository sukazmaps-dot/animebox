import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const imageService = read('lib/image-service.ts');
const mediaDelivery = read('lib/media-delivery.ts');
const cascade = read('components/AnimeImageCascade.tsx');
const detailPage = read('app/anime/[slug]/page.tsx');
const mediaWorker = read('infra/cloudflare/media-worker.js');

const availability = read('lib/catalog-availability-server.ts');
const recommendations = read('app/api/recommendations/route.ts');
const discovery = read('app/api/discovery/route.ts');
const homeFeed = read('lib/home-feed-server.ts');
const related = read('components/RelatedAnime.tsx');
const vercel = JSON.parse(read('vercel.json'));

const detailControls = read('components/AnimeDetailControls.tsx');
const episodeList = read('components/EpisodeList.tsx');
const episodeSeo = read('lib/episode-seo.ts');
const episodeRoute = read('app/anime/[slug]/episode/[episode]/page.tsx');
const animeErrorBoundary = read('app/anime/[slug]/error.tsx');
const episodeErrorBoundary = read('app/anime/[slug]/episode/[episode]/error.tsx');

const checks = [
  ['compact posters start from large', /preference === 'compact'[\s\S]*image\.large,[\s\S]*image\.extraLarge,[\s\S]*image\.medium/.test(imageService)],
  ['card DPR ladder reaches 720', mediaDelivery.includes('widths: [240, 360, 540, 720]')],
  ['card default quality is q70', mediaDelivery.includes('defaultWidth: 360') && mediaDelivery.includes('defaultQuality: 70')],
  ['large DPR ladder reaches 1080', mediaDelivery.includes('widths: [360, 540, 720, 1080]')],
  ['large detail preset defaults to 540/q80', mediaDelivery.includes('defaultWidth: 540') && mediaDelivery.includes('defaultQuality: 80')],
  ['cascade uses bounded transformed candidates', cascade.includes('buildImageCandidateChain(sources, {')],
  ['cascade exposes responsive srcset', cascade.includes('getRawImageMediaSrcSet(') && cascade.includes('srcSet={index === 0 ? mediaSrcSet : undefined}')],
  ['detail poster explicitly requests large q80', detailPage.includes('preset="large"') && detailPage.includes('quality={80}')],
  ['media worker protocol is v3', mediaWorker.includes("protocol: 'variants-v3'")],
  ['media worker uses v3 R2 namespace', mediaWorker.includes('posters-v3/')],
  ['transform fallback cannot poison R2 variant', mediaWorker.includes('if (variant && !origin.transformed)') && mediaWorker.includes('env.MEDIA_BUCKET.put(key, bytes')],

  ['playback exposure state machine exists', availability.includes("type ExposureState = 'playable' | 'degraded' | 'pending' | 'unavailable'")],
  ['missing registry row is pending', availability.includes("if (!row) return 'pending'")],
  ['only playable/degraded pass public admission', availability.includes("state === 'playable' || state === 'degraded'")],
  ['never-verified UNKNOWN fallback removed', !availability.includes('strictTarget') && !availability.includes('...playable, ...unknown')],
  ['degraded grace requires prior success', availability.includes('lastSuccessWithinGrace(row, anime, now)')],
  ['new confirmed miss becomes unavailable immediately', availability.includes('!wasEverPlayable || consecutiveMisses >= CONFIRMED_MISS_THRESHOLD')],
  ['previously playable titles keep miss shield', availability.includes("previous?.availability_status === 'playable'") && availability.includes('CONFIRMED_MISS_THRESHOLD = 3')],
  ['registry outage reuses verified snapshot only', availability.includes('const snapshot = verifiedSnapshot.get(id)') && availability.includes('healthy: false')],

  ['recommendations use verified filter', recommendations.includes("filterAnimeByAvailability(\n      result.items,\n      'recommendations'")],
  ['recommendations warm hidden candidates', recommendations.includes('refreshCatalogAvailabilityBatch(') && recommendations.includes('{ limit: 8 }')],
  ['recommendation filtered cache converges within five minutes', recommendations.includes('FILTERED_RESPONSE_CACHE_SECONDS = 5 * 60')],
  ['discovery warms hidden candidates', discovery.includes('refreshCatalogAvailabilityBatch(') && discovery.includes('{ limit: 8 }')],
  ['home feed warms hidden candidates', homeFeed.includes('refreshCatalogAvailabilityBatch(') && homeFeed.includes('{ limit: 6 }')],
  ['related titles warm hidden candidates', related.includes('refreshCatalogAvailabilityBatch(') && related.includes('{ limit: 4 }')],
  ['Vercel fallback cron remains daily-safe', vercel.crons?.some((cron) => cron.path === '/api/cron/catalog-availability' && cron.schedule === '23 4 * * *')],

  ['watch CTA requires verified playback', detailControls.includes('playable: playbackReady') && detailControls.includes('disabled={!playbackReady}')],
  ['watch handler has hard playback guard', detailControls.includes('if (!playbackReady) return;')],
  ['episode links come only from provider availability', episodeList.includes("if (availability?.status !== 'available') return []")],
  ['metadata fallback cannot recreate episode links', !episodeList.includes('return metadataEpisodeNumbers')],
  ['unknown playback renders controlled state', episodeList.includes("availability?.status === 'unknown'") && episodeList.includes('Источник временно не подтверждён')],

  ['episode SEO fails closed', episodeSeo.includes("return { status: 'unknown', episodes: [] }") && episodeSeo.includes("availability resolution failed")],
  ['episode route catches title resolution', episodeRoute.includes("return <EpisodeRouteRecovery slug={slug} episode={number} />")],
  ['episode route catches SEO availability failures', episodeRoute.includes('isEpisodeIndexable(anime.id, number).catch')],
  ['anime route has branded error boundary', animeErrorBoundary.includes("'use client'") && animeErrorBoundary.includes('onClick={reset}')],
  ['episode route has branded error boundary', episodeErrorBoundary.includes("'use client'") && episodeErrorBoundary.includes('onClick={reset}')],

  ['home cache version reflects verified playback rollout', homeFeed.includes('animebox-home-initial-feed-v4-verified-playback')],
  ['recommendation cache version reflects verified playback rollout', recommendations.includes('animebox-recommendation-candidates-v7-verified-playback')],
  ['discovery cache version reflects verified playback rollout', discovery.includes('animebox-smart-discovery-v4-verified-playback')],
];

const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);

if (checks.length < 25) {
  failures.push(`integrity suite unexpectedly shrank to ${checks.length} scenarios`);
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.2 Integrity] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  `[AnimeBox 18.5.2 Integrity] ${checks.length} media/playback/server regression scenarios passed.`,
);
