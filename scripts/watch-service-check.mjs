import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const card = read('components/SmartRecommendationCard.tsx');
const css = read('app/patch17-4-service-experience.css');
const home = read('components/HomePageClient.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const watch = read('components/useWatchSession.ts');
const player = read('components/AnimePlayer.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');

const failures = [];

if (!card.includes('name="heart" size={19}') || !card.includes('name="check" size={19}')) {
  failures.push('recommendation heart/check controls are no longer enlarged');
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
  !feed.includes("rail.id === 'endless' ? hasMore : false") ||
  !feed.includes('fetchNextPage')
) {
  failures.push('endless recommendation pagination was removed');
}

if (
  !watch.includes("window.addEventListener('online', onOnline)") ||
  !watch.includes("window.addEventListener('offline', onOffline)") ||
  !watch.includes("status === 404 || status === 409 || status === 410") ||
  !watch.includes('void startSession()')
) {
  failures.push('watch progress automatic recovery contract is incomplete');
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
