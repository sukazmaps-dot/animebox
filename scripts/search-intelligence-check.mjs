import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const smart = read('lib/smart-search.ts');
const searchServer = read('lib/search-index-server.ts');
const searchQuery = read('lib/search-query.ts');
const regressionCases = read('lib/search-regression-cases.ts');
const rankerV2Migration = read(
  'supabase/migrations/20260925043000_intelligence_search_ranker_v2.sql',
);
const animeApi = read('app/api/anime/route.ts');
const discovery = read('lib/smart-discovery.ts');
const discoveryApi = read('app/api/discovery/route.ts');
const suggestionApi = read('app/api/search/suggestions/route.ts');
const suggestionUi = read('components/SearchSuggestions.tsx');
const navbar = read('components/Navbar.tsx');
const catalog = read('components/SearchCatalogClient.tsx');
const productEvents = read('lib/product-event-names.ts');
const searchPage = read('app/search/page.tsx');
const searchSeo = read('lib/search-seo.ts');
const seoLanding = read('components/SeoAnimeLanding.tsx');
const genreLanding = read('app/anime/genre/[slug]/page.tsx');
const yearLanding = read('app/anime/year/[year]/page.tsx');
const ongoingLanding = read('app/anime/ongoing/page.tsx');
const sitemap = read('app/sitemap.ts');
const migration = read(
  'supabase/migrations/20260925030000_search_intelligence_foundation_v1.sql',
);
const securityMigration = read(
  'supabase/migrations/20260925031000_search_intelligence_security_hardening.sql',
);
const slugMigration = read(
  'supabase/migrations/20260925032000_search_slug_alias_backfill.sql',
);

const failures = [];

for (const needle of [
  'normalizeSearchText',
  'buildSearchQueryVariants',
  'reverseTransliterateSearchQuery',
  'diceSimilarity',
  'rankAnimeForSmartSearchDetailed',
]) {
  if (!smart.includes(needle)) {
    failures.push(`smart-search missing ${needle}`);
  }
}

for (const needle of [
  'searchLocalAnimeIndex',
  'hydrateLocalAnimeHits',
  'indexAnimeSearchDocuments',
  'search_anime_hybrid_lexical_v2',
  'matchedText',
  'matchKind',
]) {
  if (!searchServer.includes(needle)) {
    failures.push(`search index server missing ${needle}`);
  }
}

if (
  !searchQuery.includes("SearchQueryMode = 'title' | 'structured' | 'context'") ||
  !searchQuery.includes('classifySearchQuery') ||
  !searchQuery.includes('shouldBootstrapSearchProvider')
) {
  failures.push('18.0 query classification contract is incomplete');
}

if (
  !animeApi.includes('searchLocalAnimeIndex(rawSearch') ||
  !animeApi.includes('mergeAnimeCandidates(localAnime, candidates)') ||
  !animeApi.includes('localIndexUsed') ||
  !animeApi.includes('correction') ||
  !animeApi.includes('topMatchKind')
) {
  failures.push('anime API does not merge local fuzzy candidates');
}

for (const needle of [
  'create extension if not exists pg_trgm',
  'create extension if not exists unaccent',
  'create extension if not exists vector',
  'anime_search_documents',
  'search_anime_lexical',
  'match_anime_semantic',
  'anime_catalog_search_document_sync',
]) {
  if (!migration.includes(needle)) {
    failures.push(`search migration missing ${needle}`);
  }
}

if (
  !discovery.includes('includeTags: string[]') ||
  !discovery.includes('CONTEXT_TAGS') ||
  !discovery.includes('anime.description') ||
  !discoveryApi.includes('searchLocalAnimeIndex') ||
  !discoveryApi.includes('primaryTag')
) {
  failures.push('contextual discovery retrieval is incomplete');
}

if (
  !searchServer.includes('searchLocalAnimeSuggestions') ||
  !suggestionApi.includes('searchLocalAnimeSuggestions') ||
  !suggestionApi.includes("scope: 'search_suggestions_ip'") ||
  !suggestionUi.includes('AbortController') ||
  !suggestionUi.includes("event.key === 'ArrowDown'") ||
  !suggestionUi.includes("event.key === 'Enter'") ||
  !suggestionUi.includes('highlightTitle') ||
  !suggestionUi.includes('search_suggestion_click') ||
  !navbar.includes('<SearchSuggestions') ||
  !catalog.includes('SEARCH_DEBOUNCE_MS = 200')
) {
  failures.push('live search suggestions/debounce contract is incomplete');
}

for (const eventName of [
  'search_query',
  'search_zero_result',
  'search_context_query',
  'search_suggestion_click',
  'search_suggestion_keyboard',
  'search_correction_click',
]) {
  if (!productEvents.includes(`'${eventName}'`)) {
    failures.push(`product events missing ${eventName}`);
  }
}

if (
  !searchPage.includes('hasDynamicCatalogState') ||
  !searchPage.includes('{ index: false, follow: true }') ||
  !searchSeo.includes('SEO_GENRE_LANDINGS') ||
  !genreLanding.includes("alternates: { canonical: path }") ||
  !yearLanding.includes("alternates: { canonical: path }") ||
  !ongoingLanding.includes("alternates: { canonical: path }") ||
  !seoLanding.includes("'@type': 'ItemList'") ||
  !seoLanding.includes("'@type': 'BreadcrumbList'") ||
  !sitemap.includes('SEO_GENRE_LANDINGS') ||
  !sitemap.includes('/anime/ongoing')
) {
  failures.push('17.9 SEO landing/canonical/sitemap contract is incomplete');
}

if (
  !securityMigration.includes('from public, anon, authenticated') ||
  !securityMigration.includes('search_anime_lexical') ||
  !securityMigration.includes('match_anime_semantic') ||
  !securityMigration.includes('sync_anime_catalog_search_document')
) {
  failures.push('search RPC role hardening is incomplete');
}

if (
  !slugMigration.includes("concat_ws(' ', search_text, slug)") ||
  !slugMigration.includes('anime_search_documents_no_client_access') ||
  !slugMigration.includes('new.slug')
) {
  failures.push('legacy search corpus slug alias backfill is incomplete');
}

for (const needle of [
  'search_anime_hybrid_lexical_v2',
  "match_kind text",
  "matched_text text",
  "grant execute on function public.search_anime_hybrid_lexical_v2",
  "from public, anon, authenticated",
]) {
  if (!rankerV2Migration.includes(needle)) {
    failures.push(`18.0 lexical ranker migration missing ${needle}`);
  }
}

for (const query of [
  'магичиская битва',
  'friren',
  'ван писс',
  'naruta',
  '2 сезон 4 серия',
  'девушка аптекарь во дворце',
  'эльфийка путешествует после смерти героя',
  'переродился слизью',
]) {
  if (!regressionCases.includes(query)) {
    failures.push(`18.0 regression corpus missing: ${query}`);
  }
}

if (
  !discovery.includes("chipId.startsWith('tag:')") ||
  !discovery.includes('CONTEXT_TAGS.find')
) {
  failures.push('context search chips cannot remove tag constraints');
}

if (failures.length) {
  console.error('[AnimeBox Search Intelligence] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Search Intelligence] core search invariants passed.');
