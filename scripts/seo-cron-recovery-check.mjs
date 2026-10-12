import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const sql = read('supabase/migrations/20261012143500_seo_index_railway_cron_recovery_v1.sql');
const endpoint = read('app/api/cron/seo-anime-index/route.ts');
const animeSitemap = read('app/anime/sitemap.ts');
const episodeSitemap = read('app/episodes/sitemap.ts');
const episodeRegistry = read('lib/seo-episodes.ts');
const sitemapIndex = read('app/sitemap-index.xml/route.ts');
const robots = read('app/robots.ts');
const recent = read('app/sitemap-recent.xml/route.ts');
const video = read('app/video-sitemap.xml/route.ts');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/animebox-quality.yml');

const includes = (name, haystack, needles) => {
  for (const needle of needles) {
    assert.ok(haystack.includes(needle), `${name}: expected ${needle}`);
  }
};

includes('SEO cron authorization', endpoint, [
  'secureServerSecretEqual', "optionalServerSecret('SEO_INDEX_CRON_SECRET')",
  "request.headers.get('x-seo-cron-secret')", 'isCronAuthorized(request)',
  "beginOperationalJob('seo-anime-index'", "createSystemJobObserver('seo-anime-index'",
  "status: 401", "Cache-Control': 'no-store'",
]);
includes('Scheduled SQL', sql, [
  "vault.decrypted_secrets", "animebox_seo_index_cron_secret",
  "'animebox-seo-anime-index'", "'53 4 * * *'",
  "'animebox-seo-anime-index-retry'", "'23 6 * * *'",
  "'x-seo-cron-secret'", "timeout_milliseconds := 55000",
  "where job_key = 'seo-anime-index'", "status = 'succeeded'",
  "url := 'https://youranimebox.com/api/cron/seo-anime-index'",
]);
assert.ok(!/create\s+extension\b/i.test(sql), 'Do not install extensions through SEO migration');
assert.ok(!/\b(?:alter|drop)\s+table\b/i.test(sql), 'SEO cron cannot mutate catalogue tables');
assert.ok(!/['"]CRON_SECRET['"]/.test(sql), 'Do not duplicate global app secret in cron');
assert.ok(!/vault\.create_secret\(/.test(sql), 'Never persist a hardcoded production credential in git');

for (const [name, sitemap] of [
  ['anime', animeSitemap],
  ['episode', episodeSitemap],
]) {
  assert.ok(/catch \(error\) \{[\s\S]*?throw error;\s*\}/.test(sitemap),
    `${name} sitemap must surface DB errors rather than returning 200 empty XML`);
  assert.ok(!/catch \(error\) \{[^}]*return \[\];/.test(sitemap),
    `${name} sitemap still hides database errors`);
}
includes('episode deterministic order', episodeRegistry, [
  ".order('anime_id', { ascending: true })",
  ".order('episode_number', { ascending: true })",
  ".eq('indexable', true)",
  "last_content_change_at",
]);
assert.ok(!episodeRegistry.includes(".order('last_confirmed_at', { ascending: false })"),
  'Episode shard ordering must not depend on freshness updates');
includes('sitemap index', sitemapIndex, [
  '/sitemap.xml', '/sitemap-recent.xml', '/video-sitemap.xml',
  '/anime/sitemap/', '/episodes/sitemap/',
]);
includes('robots', robots, ["sitemap: `${SITE_URL}/sitemap-index.xml`"]);
includes('recent sitemap failure', recent, ['status: 503', "'Cache-Control': 'no-store'"]);
includes('video sitemap failure', video, ['status: 503', "'Cache-Control': 'no-store'"]);
assert.equal(packageJson.scripts['seo-cron-recovery:check'],
  'node scripts/seo-cron-recovery-check.mjs');
assert.ok(packageJson.scripts.prebuild.includes('npm run seo-cron-recovery:check'));
assert.ok(workflow.includes('npm run seo-cron-recovery:check'));

console.log('[Patch 25.0 + 25.1] Cron auth, fail-closed sitemap and stable episode shards verified.');
