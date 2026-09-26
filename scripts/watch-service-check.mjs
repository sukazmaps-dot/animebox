import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const card = read('components/SmartRecommendationCard.tsx');
const css = read('app/patch17-4-service-experience.css');
const platformCss = read('app/patch17-6-home-recommendation-actions.css');
const home = read('components/home/HomeDeferredCommunity.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const watch = read('components/useWatchSession.ts');
const player = read('components/AnimePlayer.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const watchServer = read('lib/watch-server.ts');

const failures = [];

if (!card.includes('name="heart" size={19}') || !card.includes('name="check" size={19}')) {
  failures.push('recommendation heart/check controls are no longer enlarged');
}

if (
  !card.includes('smart-card__feedback--like') ||
  !card.includes('smart-card__feedback--watched') ||
  !card.includes('smart-card__feedback--dismiss') ||
  !platformCss.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important') ||
  !platformCss.includes('grid-area: like !important') ||
  !platformCss.includes('grid-area: watched !important') ||
  !platformCss.includes('grid-area: dismiss !important') ||
  !platformCss.includes('border-radius: 999px !important')
) {
  failures.push('recommendation feedback controls are no longer visibly wide pills');
}

if (
  !css.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important') ||
  !css.includes('.home-library-panel--footer')
) {
  failures.push('compact desktop service footer contract is missing');
}

if (!home.includes('placement="home_footer"')) {
  failures.push('Telegram promo is not tagged as a home footer placement');
}

if (
  !(
    feed.includes('hasMore={railHasMore}') ||
    feed.includes('hasMore={rail.items.length > 0 ? railHasMore : false}')
  ) ||
  !feed.includes('ensureRailDepth(rail)') ||
  !feed.includes('sharedBatchPromiseRef') ||
  !(
    feed.includes('loading={railLoading}') ||
    feed.includes('loading={showRailSkeleton}')
  )
) {
  failures.push('shared per-rail recommendation pagination was removed');
}

if (
  !watch.includes("window.addEventListener('online', onOnline)") ||
  !watch.includes("window.addEventListener('offline', onOffline)") ||
  !watch.includes("status === 409") ||
  !watch.includes('supersededRef.current = true') ||
  !watch.includes("status === 404 || status === 410") ||
  !watch.includes('!supersededRef.current') ||
  !watch.includes('void startSession()')
) {
  failures.push('watch progress recovery / cross-device ownership contract is incomplete');
}

if (
  !watchServer.includes(".select('episode_id,ended_at')") ||
  !watchServer.includes(".is('ended_at', null)") ||
  !watchServer.includes(".select('id')") ||
  !watchServer.includes('if (endedSession?.id && session?.episode_id && positionMs != null)')
) {
  failures.push('stale ended watch sessions can overwrite newer resume state');
}

if (
  !player.includes('trackingRecovering') ||
  !player.includes('animebox-player-sync-status')
) {
  failures.push('player does not expose non-blocking progress recovery');
}

if (
  !episodePage.includes("nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'След. серия'}") ||
  !episodePage.includes('onEnded={hasNext ? goToNext : undefined}')
) {
  failures.push('next episode / next season navigation contract regressed');
}

if (!player.includes('switchToFallback') || !player.includes('findFallbackCandidate')) {
  failures.push('automatic player source fallback contract regressed');
}

if (failures.length) {
  console.error('[AnimeBox Watch Service] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Watch Service] watch, fallback, resume UX and home service invariants passed.');
