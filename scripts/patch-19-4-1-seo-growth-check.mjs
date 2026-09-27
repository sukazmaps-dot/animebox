import fs from 'node:fs';

const episodeSeo = fs.readFileSync('lib/episode-seo.ts', 'utf8');
const quality = fs.readFileSync('lib/seo-quality.ts', 'utf8');
const episodeIndex = fs.readFileSync('lib/seo-episode-index.ts', 'utf8');
const episodeSitemap = fs.readFileSync('lib/seo-episodes.ts', 'utf8');
const recent = fs.readFileSync('app/sitemap-recent.xml/route.ts', 'utf8');
const video = fs.readFileSync('app/video-sitemap.xml/route.ts', 'utf8');
const sitemapIndex = fs.readFileSync('app/sitemap-index.xml/route.ts', 'utf8');
const episodePage = fs.readFileSync(
  'app/anime/[slug]/episode/[episode]/page.tsx',
  'utf8',
);
const migration = fs.readFileSync(
  'supabase/migrations/20260927204500_seo_episode_content_freshness_v2.sql',
  'utf8',
);

for (const needle of [
  'getEpisodeSeoIdentity',
  'buildEpisodeSeoTitleVariants',
  'alternateTitle',
  "anime.status === 'RELEASING'",
  'isVideoSeoQualityReady',
]) {
  if (!episodeSeo.includes(needle)) {
    throw new Error('Patch 19.4.1 episode SEO invariant missing: ' + needle);
  }
}

for (const needle of [
  'episodeSeoQualityScore',
  'videoSeoCompletenessScore',
  'isCanonicalAnimeBoxUrl',
  'safeSeoHttpsUrl',
]) {
  if (!quality.includes(needle)) {
    throw new Error('Patch 19.4.1 quality invariant missing: ' + needle);
  }
}

for (const needle of [
  'content_fingerprint',
  'last_content_change_at',
  "createHash('sha256')",
]) {
  if (!episodeIndex.includes(needle)) {
    throw new Error('Patch 19.4.1 freshness writer missing: ' + needle);
  }
}

if (!episodeSitemap.includes('row.last_content_change_at')) {
  throw new Error('Episode sitemap still does not use content-change lastmod.');
}
if (episodeSitemap.includes("updatedAt:\n        typeof row.last_confirmed_at")) {
  throw new Error('Episode sitemap regressed to provider-confirmation lastmod.');
}

for (const needle of [
  'RECENT_WINDOW_MS',
  'last_content_change_at',
  'getCopyrightRestrictedEpisodeKeys',
  'first_available_at',
]) {
  if (!recent.includes(needle)) {
    throw new Error('Recent sitemap invariant missing: ' + needle);
  }
}

if (!sitemapIndex.includes('/sitemap-recent.xml')) {
  throw new Error('Sitemap index does not expose recent sitemap.');
}

if (!video.includes('isVideoSeoQualityReady')) {
  throw new Error('Video sitemap is not using shared quality gate.');
}

if (!episodePage.includes('shouldIndexAnime(anime)')) {
  throw new Error('Episode indexability is not gated by parent anime quality.');
}

for (const needle of [
  'last_content_change_at',
  'content_fingerprint',
  'Routine confirmation must not be used as sitemap lastmod',
]) {
  if (!migration.includes(needle)) {
    throw new Error('SEO freshness migration invariant missing: ' + needle);
  }
}

console.log('Patch 19.4.1 SEO Growth Engine invariants OK');
