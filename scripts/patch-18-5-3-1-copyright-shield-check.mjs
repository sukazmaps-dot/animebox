import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read(
  'supabase/migrations/20260925154500_copyright_takedown_shield_v2.sql',
);
const copyrightServer = read('lib/copyright-server.ts');
const copyrightSeo = read('lib/copyright-seo-server.ts');
const adminRoute = read('app/api/admin/copyright/route.ts');
const adminClient = read('components/admin/CopyrightAdminClient.tsx');
const titlePage = read('app/anime/[slug]/page.tsx');
const episodePage = read('app/anime/[slug]/episode/[episode]/page.tsx');
const episodeSeo = read('lib/episode-seo.ts');
const seoIndex = read('lib/seo-episode-index.ts');
const episodeSitemap = read('app/episodes/sitemap.ts');
const videoSitemap = read('app/video-sitemap.xml/route.ts');
const providerControl = read('lib/player-source-control.ts');

const failures = [];

for (const needle of [
  "source_type text",
  "external_reference text",
  "source_url text",
  "source_type in ('direct_notice', 'external_platform')",
  "source_type = 'direct_notice'",
  "source_type = 'external_platform'",
]) {
  if (!migration.includes(needle)) {
    failures.push(`external notice migration missing: ${needle}`);
  }
}

if (
  !copyrightServer.includes('getPlaybackRestriction') ||
  !providerControl.includes('getPlaybackRestriction({') ||
  !providerControl.includes("reason = 'copyright_restricted'")
) {
  failures.push('provider copyright enforcement is no longer wired');
}

if (
  !copyrightSeo.includes('getCopyrightRestrictedEpisodeKeys') ||
  !copyrightSeo.includes("['title', 'season', 'episode']") ||
  !copyrightSeo.includes("row.scope === 'title' || row.scope === 'season'")
) {
  failures.push('copyright-aware SEO batch filter is incomplete');
}

if (
  !episodeSeo.includes('getPlaybackRestriction({') ||
  !episodeSeo.includes('if (copyrightRestriction) return false')
) {
  failures.push('episode indexability does not fail closed on an active restriction');
}

if (
  !seoIndex.includes('getCopyrightRestrictedEpisodeKeys(') ||
  !seoIndex.includes('restrictedKeys.has(copyrightEpisodeKey(')
) {
  failures.push('fresh SEO sync can resurrect restricted episodes');
}

if (
  !episodeSitemap.includes('getCopyrightRestrictedEpisodeKeys(') ||
  !episodeSitemap.includes('copyrightEpisodeKey(')
) {
  failures.push('episode sitemap does not filter active restrictions');
}

if (
  !videoSitemap.includes('getCopyrightRestrictedEpisodeKeys(') ||
  !videoSitemap.includes('copyrightEpisodeKey(')
) {
  failures.push('video sitemap does not filter active restrictions');
}

if (
  !episodePage.includes('CopyrightRestrictedEpisode') ||
  !episodePage.includes("'max-video-preview': 0") ||
  !episodePage.includes('getPlaybackRestriction({')
) {
  failures.push('restricted episode route does not render a noindex controlled state');
}

if (
  !titlePage.includes('playbackRestricted') ||
  !titlePage.includes('<PlaybackRestrictionNotice />') ||
  !titlePage.includes('animeStructuredData &&') ||
  !titlePage.includes('{!playbackRestricted && (')
) {
  failures.push('title page still exposes watch-oriented UI/structured data when restricted');
}

if (
  !adminRoute.includes("action === 'import_external_takedown'") ||
  !adminRoute.includes("action: 'copyright_external_takedown'") ||
  !adminRoute.includes('suppressEpisodeSeo({') ||
  !adminClient.includes('EXTERNAL TAKEDOWN') ||
  !adminClient.includes("action: 'import_external_takedown'")
) {
  failures.push('external takedown admin workflow is incomplete or unaudited');
}

for (const forbidden of [
  'claimant_email: externalReference',
  'signature: externalReference',
]) {
  if (adminRoute.includes(forbidden)) {
    failures.push(`external notice import fabricates claimant identity data: ${forbidden}`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.3.1 Copyright Shield] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.3.1 Copyright Shield] title/episode playback, SEO, sitemap and external notice invariants passed.',
);
