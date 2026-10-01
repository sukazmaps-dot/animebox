import fs from 'node:fs';

const failures = [];
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20261001133000_patch24_4_local_search_authority.sql',
);
const searchServer = read('lib/search-index-server.ts');
const instantApi = read('app/api/search/instant/route.ts');
const instantClient = read('lib/instant-search-client.ts');
const catalog = read('components/SearchCatalogClient.tsx');
const maintenance = read('lib/search-index-maintenance-server.ts');
const cron = read('app/api/cron/search-index-maintenance/route.ts');
const adminRepair = read(
  'app/api/admin/search-performance/repair/route.ts',
);
const performanceServer = read('lib/search-performance-server.ts');
const dashboard = read('components/admin/SearchPerformanceDashboard.tsx');
const vercel = read('vercel.json');

const must = (source, needle, label) => {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
};

for (const column of [
  'studios text[]',
  'format text',
  'start_year integer',
  'total_episodes integer',
  'finished boolean',
  'catalog_metadata_version smallint',
  'catalog_updated_at timestamptz',
]) {
  must(migration, column, `rich search schema ${column}`);
}

must(
  migration,
  'search_anime_hybrid_lexical_v3',
  'v3 lexical RPC',
);
must(
  migration,
  'grant execute on function public.search_anime_hybrid_lexical_v3',
  'v3 service-role grant',
);
must(
  migration,
  'repair_anime_search_documents_v1',
  'bounded repair RPC',
);
must(
  migration,
  'anime_catalog_search_document_sync',
  'catalog/search projection trigger',
);
must(
  migration,
  "array_to_string(anime_search_documents.aliases, ' ')",
  'alias-preserving search text rebuild',
);
must(
  migration,
  "array_to_string(anime_search_documents.tags, ' ')",
  'tag-preserving search text rebuild',
);
must(
  migration,
  'anime_search_documents.description',
  'description-preserving search text rebuild',
);

must(
  searchServer,
  "'search_anime_hybrid_lexical_v3'",
  'application v3 RPC',
);
must(
  searchServer,
  "'search_anime_hybrid_lexical_v2'",
  'v2 staged fallback',
);
must(
  searchServer,
  'catalogMetadataVersion',
  'rich metadata version mapping',
);
must(searchServer, 'startYear', 'year mapping');
must(searchServer, 'totalEpisodes', 'episode mapping');
must(searchServer, 'studios: hit.studios', 'studio mapping');
must(
  searchServer,
  'Safe pre-migration fallback',
  'rich upsert rollout fallback',
);

must(instantApi, 'richItems', 'instant rich item count');
must(instantApi, 'richSharePct', 'instant rich coverage');
must(
  instantApi,
  "X-AnimeBox-Search-Path': 'instant-local-v3'",
  'instant v3 marker',
);
if (instantApi.includes('getAnimesWithShikimori')) {
  failures.push('instant API must stay provider-free');
}

must(instantClient, 'richSharePct?: number', 'instant rich client contract');
must(
  catalog,
  'rich_card_share_pct',
  'first-result rich telemetry',
);

must(
  maintenance,
  'repair_anime_search_documents_v1',
  'maintenance repair call',
);
must(
  maintenance,
  'migrationReady',
  'migration readiness coverage',
);
if (
  maintenance.includes('getAnimesWithShikimori') ||
  maintenance.includes('getAnimesByIdsWithShikimori')
) {
  failures.push('search index maintenance must not call external providers');
}

must(cron, 'isCronAuthorized', 'cron authorization');
must(cron, "beginOperationalJob('search-index-maintenance'", 'cron lease/control');
must(cron, "createSystemJobObserver('search-index-maintenance'", 'cron observer');
must(cron, 'repairSearchIndexCoverage(750)', 'bounded cron batch');

must(
  adminRepair,
  "requireAdminMutation",
  'admin mutation boundary',
);
must(adminRepair, 'writeAdminAudit', 'admin repair audit');
must(
  adminRepair,
  'repairSearchIndexCoverage(2_000)',
  'bounded admin repair',
);

must(
  performanceServer,
  'richCoveragePct',
  'rich coverage health policy',
);
must(
  performanceServer,
  'instantRichShares',
  'observed rich-card aggregation',
);
must(
  dashboard,
  'Починить индекс',
  'manual repair control',
);
must(
  dashboard,
  'Rich index coverage',
  'rich coverage dashboard KPI',
);
must(
  dashboard,
  'search_index_migration_required',
  'migration rollout UX',
);

must(
  vercel,
  '"/api/cron/search-index-maintenance"',
  'search maintenance schedule',
);

if (failures.length) {
  console.error(
    '[AnimeBox Patch 24.4 Local Search Authority] check failed:',
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 24.4 Local Search Authority] rich cards, v3 fallback, self-healing and coverage diagnostics passed.',
);
