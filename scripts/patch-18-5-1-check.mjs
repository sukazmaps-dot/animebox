import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const catalog = read('components/SearchCatalogClient.tsx');
const animeClient = read('lib/anime-client.ts');
const animeApi = read('app/api/anime/route.ts');
const anilist = read('lib/anilist.ts');
const combined = read('lib/combined-anime.ts');
const imageService = read('lib/image-service.ts');
const mediaDelivery = read('lib/media-delivery.ts');

const failures = [];
const checks = [
  ['AniList query requests PageInfo', anilist.includes('pageInfo {') && anilist.includes('hasNextPage')],
  ['AniList forwards PageInfo without second request', anilist.includes('fetchOptions?.onPageInfo?.({')],
  ['localized provider forwards page info', combined.includes('onPageInfo?: (pageInfo: { hasNextPage: boolean }) => void')],
  ['API exposes explicit pagination contract', animeApi.includes('pagination: {') && animeApi.includes('hasNextPage: providerHasNextPage')],
  ['client payload types pagination', animeClient.includes('export type AnimePaginationMeta')],
  ['catalog consumes API hasNextPage', catalog.includes('payload.pagination?.hasNextPage')],
  ['catalog no longer relies only on page length', !catalog.includes('setHasNextPage(payload.anime.length === CATALOG_PAGE_SIZE)')],
  ['catalog appends later pages', catalog.includes('mergeAnimePages(current, payload.anime)')],
  ['catalog dedupes accumulated pages', catalog.includes('const byId = new Map<number, Anime>()')],
  ['catalog uses near-viewport loading', catalog.includes("rootMargin: '900px 0px'")],
  ['catalog keeps manual load-more fallback', catalog.includes("loading ? 'Загружаем…' : 'Показать ещё'")],
  ['compact posters start from quality source', /preference === 'compact'[\s\S]*image\.large,[\s\S]*image\.extraLarge,[\s\S]*image\.medium/.test(imageService)],
  ['card srcset includes Retina widths', mediaDelivery.includes('widths: [240, 360, 540, 720]')],
  ['card quality avoids low-detail WebP', mediaDelivery.includes('defaultQuality: 70')],
  ['Russian display mappings stay correct', anilist.includes("FINISHED: 'Вышло'") && anilist.includes("MOVIE: 'Фильм'")],
];

for (const [label, ok] of checks) {
  if (!ok) failures.push(label);
}

if (checks.length !== 15) {
  failures.push(`expected 15 regression scenarios, got ${checks.length}`);
}

if (failures.length) {
  console.error('[AnimeBox 18.5.1] Regression check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox 18.5.1] 15 search/catalog/image regression scenarios passed.');
