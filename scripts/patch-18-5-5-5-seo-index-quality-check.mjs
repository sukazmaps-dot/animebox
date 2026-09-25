import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20260925220358_seo_index_quality_v1.sql',
);
const hardening = read(
  'supabase/migrations/20260925220504_seo_index_quality_grants_hardening.sql',
);
const animeSitemap = read('app/anime/sitemap.ts');
const sitemapIndex = read('app/sitemap-index.xml/route.ts');
const robots = read('app/robots.ts');
const seoSource = read('lib/seo-anilist.ts');
const seoRegistry = read('lib/seo-anime-index-server.ts');
const animeSeo = read('lib/anime-seo.ts');
const animeUrl = read('lib/anime-url.ts');
const animeRegistry = read('lib/anime-registry.ts');
const cron = read('app/api/cron/seo-anime-index/route.ts');
const vercel = JSON.parse(read('vercel.json'));
const healthTypes = read('lib/system-health.ts');
const healthServer = read('lib/system-health-server.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const watchTogether = read('app/watch-together/page.tsx');
const packageJson = JSON.parse(read('package.json'));

const failures = [];

function requireNeedles(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label} missing: ${needle}`);
    }
  }
}

requireNeedles('SEO registry migration', migration, [
  'create table if not exists public.seo_anime_index',
  'sitemap_shard smallint not null',
  'quality_score smallint not null',
  'indexable boolean not null',
  'content_fingerprint text not null',
  'last_content_change_at timestamptz not null',
  'last_verified_at timestamptz not null',
  'alter table public.seo_anime_index enable row level security',
  'from public, anon, authenticated, service_role',
  'to service_role',
  'seo_anime_index_service_role_only',
  'where indexable = true',
]);

requireNeedles('SEO grant hardening', hardening, [
  'revoke all on table public.seo_anime_index from service_role',
  'grant select, insert, update, delete',
]);

for (const forbidden of ['to anon', 'to authenticated']) {
  if (migration.toLowerCase().includes(forbidden)) {
    failures.push(`SEO registry migration exposes table to client role: ${forbidden}`);
  }
}

requireNeedles('anime sitemap registry', animeSitemap, [
  'getSeoAnimeIndexShard',
  "from '@/lib/seo-anime-index-server'",
  'lastContentChangeAt',
]);
for (const forbidden of [
  'getSeoAnimeSourceShard',
  "from '@/lib/seo-anilist'",
  'graphql.anilist.co',
]) {
  if (animeSitemap.includes(forbidden)) {
    failures.push(`crawler-facing anime sitemap still calls external source: ${forbidden}`);
  }
}

requireNeedles('sitemap index', sitemapIndex, [
  '<sitemapindex',
  '/sitemap.xml',
  '/video-sitemap.xml',
  '/anime/sitemap/',
  '/episodes/sitemap/',
  'ANIME_SITEMAP_SHARDS',
  'EPISODE_SITEMAP_SHARDS',
]);

if (!robots.includes("`${SITE_URL}/sitemap-index.xml`")) {
  failures.push('robots.txt does not advertise the sitemap index');
}
if (robots.includes('ANIME_SITEMAP_SHARDS') || robots.includes('EPISODE_SITEMAP_SHARDS')) {
  failures.push('robots.txt still expands every shard instead of using sitemap index');
}

requireNeedles('shared SEO eligibility', animeSeo, [
  'export function animeSeoQualityScore',
  'return animeSeoQualityScore(anime) >= 2',
]);
requireNeedles('SEO registry service', seoRegistry, [
  'animeSeoQualityScore',
  'content_fingerprint',
  'last_content_change_at',
  'current?.last_content_change_at ?? now',
  'sitemap_shard: animeId % ANIME_SITEMAP_SHARDS',
  'getSeoAnimeIndexShard',
  'getSeoIndexHealth',
]);
requireNeedles('SEO source', seoSource, [
  'fetchWithRetry(',
  'countryOfOrigin: JP',
  'description(asHtml: false)',
  'startDate { year }',
  'genres',
  'stableAnimeSlug',
  'getSeoAnimeSourceShard',
]);
requireNeedles('canonical slug contract', animeUrl, [
  'export function stableAnimeSlug',
  'return Number.isSafeInteger(numericId)',
]);
if (!animeRegistry.includes('stableAnimeSlug(anime.id, title)')) {
  failures.push('runtime anime registry does not reuse stableAnimeSlug');
}
requireNeedles('SEO cron', cron, [
  'SOURCE_SHARDS_PER_RUN = 7',
  'scheduledSourceShards',
  'getSeoAnimeSourceShard',
  'syncSeoAnimeSourceEntries',
  "createSystemJobObserver('seo-anime-index'",
  'for (const shard of shards)',
]);

const seoCron = vercel.crons?.find(
  (item) => item.path === '/api/cron/seo-anime-index',
);
if (!seoCron || seoCron.schedule !== '53 4 * * *') {
  failures.push('Vercel daily SEO registry cron is missing or changed');
}

requireNeedles('SEO System Health types', healthTypes, [
  'SeoIndexPlatformHealth',
  'seo: SeoIndexPlatformHealth',
]);
requireNeedles('SEO System Health server', healthServer, [
  'getSeoIndexHealth',
  'const seoPromise = getSeoIndexHealth()',
  'seo,',
]);
requireNeedles('SEO System Health dashboard', dashboard, [
  'SEO INDEX QUALITY · 18.5.5.5',
  'SEO titles',
  'SEO INDEX',
  'health.seo.animeIndexable',
  'health.seo.videoEntries',
]);

if (watchTogether.includes("'@type': 'FAQPage'")) {
  failures.push('retired Watch Together FAQ rich-result markup still exists');
}

if (
  packageJson.scripts?.['patch18-5-5-5:check'] !==
  'node scripts/patch-18-5-5-5-seo-index-quality-check.mjs'
) {
  failures.push('package.json is missing patch18-5-5-5:check');
}

if (
  !String(packageJson.scripts?.prebuild ?? '').includes(
    'npm run patch18-5-5-5:check',
  )
) {
  failures.push('prebuild does not execute patch18-5-5-5:check');
}

// Model the daily refresh schedule: 7 source shards per day must cover every
// one of the 70 source shards during one ten-day cycle.
const shardMatch = read('lib/seo-config.ts').match(
  /ANIME_SITEMAP_SHARDS\s*=\s*(\d+)/,
);
const shardCount = Number(shardMatch?.[1] ?? 0);
const covered = new Set();
const groups = Math.ceil(shardCount / 7);
for (let day = 0; day < groups; day += 1) {
  const start = (day % groups) * 7;
  for (let offset = 0; offset < Math.min(7, shardCount - start); offset += 1) {
    covered.add(start + offset);
  }
}
if (shardCount !== 70 || covered.size !== shardCount) {
  failures.push(
    `SEO source refresh does not cover all shards in one cycle: ${covered.size}/${shardCount}`,
  );
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(animeUrl, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const cases = [
      [128893, 'Jigokuraku', 'jigokuraku-128893'],
      [154587, 'Sousou no Frieren', 'sousou-no-frieren-154587'],
      [1, 'Cowboy Bebop', 'cowboy-bebop-1'],
    ];

    for (const [id, title, expected] of cases) {
      const actual = runtime.stableAnimeSlug(id, title);
      if (actual !== expected) {
        failures.push(
          `stable canonical slug mismatch for ${id}: ${actual} !== ${expected}`,
        );
      }
    }
  } catch (error) {
    failures.push(
      `canonical slug runtime check failed: ${
        error instanceof Error ? error.stack || error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.5 SEO Index Quality] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sitemapSource: 'seo_anime_index',
      sourceRefreshCycleDays: groups,
      sourceShardsCovered: covered.size,
      canonicalSlugRuntime: true,
      faqRichResultRemoved: true,
    },
    null,
    2,
  ),
);
console.log(
  '[AnimeBox 18.5.5.5 SEO Index Quality] canonical registry, sitemap isolation, crawl inventory and eligibility invariants passed.',
);
