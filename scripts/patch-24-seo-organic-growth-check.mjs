import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const searchSeo = read('lib/search-seo.ts');
const searchPage = read('app/search/page.tsx');
const sitemap = read('app/sitemap.ts');
const studioPage = read('app/anime/studio/[slug]/page.tsx');
const seasonPage = read('app/anime/season/[season]/[year]/page.tsx');
const indexNow = read('lib/indexnow.ts');
const seoIndex = read('lib/seo-anime-index-server.ts');
const seoCron = read('app/api/cron/seo-anime-index/route.ts');

const failures = [];

for (const needle of [
  'SEO_STUDIO_LANDINGS',
  'getSeoStudio',
  'seoSeasonLandings',
  'getSeoSeason',
  'isSeoSeasonYear',
  'seoSeasonSlug',
]) {
  if (!searchSeo.includes(needle)) {
    failures.push(`search SEO registry missing ${needle}`);
  }
}

for (const needle of [
  "title: 'Каталог аниме — жанры, сезоны и студии'",
  '<CatalogDiscoveryLinks />',
  '/anime/ongoing',
  '/anime/genre/',
  '/anime/studio/',
  '/anime/season/',
]) {
  if (!searchPage.includes(needle)) {
    failures.push(`catalog SEO graph missing ${needle}`);
  }
}

for (const needle of [
  'SEO_STUDIO_LANDINGS.map',
  'seoSeasonLandings().map',
  '/copyright',
]) {
  if (!sitemap.includes(needle)) {
    failures.push(`root sitemap missing ${needle}`);
  }
}

for (const [label, source, needles] of [
  [
    'studio landing',
    studioPage,
    [
      'getSeoStudio',
      "alternates: { canonical: path }",
      "robots: { index: true, follow: true }",
      'studioNames: [studio.providerName]',
      '<SeoAnimeLanding',
    ],
  ],
  [
    'season landing',
    seasonPage,
    [
      'getSeoSeason',
      'isSeoSeasonYear',
      "alternates: { canonical: path }",
      "robots: { index: true, follow: true }",
      'season,',
      'year,',
      '<SeoAnimeLanding',
    ],
  ],
]) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label} missing ${needle}`);
    }
  }
}

for (const needle of [
  "const INDEXNOW_ENDPOINT = 'https://yandex.com/indexnow'",
  'MAX_URLS_PER_REQUEST = 10_000',
  'INDEXNOW_KEY_LOCATION',
  'url.origin !== site.origin',
  'AbortSignal.timeout',
]) {
  if (!indexNow.includes(needle)) {
    failures.push(`IndexNow client missing ${needle}`);
  }
}

for (const needle of [
  'changedSlugs',
  "'anime_id,slug,indexable,content_fingerprint",
  'changedSlugs.add(current.slug.trim())',
]) {
  if (!seoIndex.includes(needle)) {
    failures.push(`SEO anime index delta tracking missing ${needle}`);
  }
}

for (const needle of [
  'submitIndexNowUrls',
  'changedUrls',
  'encodeURIComponent(slug)',
  'indexNow,',
]) {
  if (!seoCron.includes(needle)) {
    failures.push(`SEO cron IndexNow integration missing ${needle}`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 24 SEO Organic Growth] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Patch 24 SEO Organic Growth] invariants passed.');
