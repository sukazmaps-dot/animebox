import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const player = read('components/AnimePlayer.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const timelineServer = read('lib/episode-timeline-server.ts');
const timelineApi = read('app/api/episodes/timeline/route.ts');
const videoSitemap = read('app/video-sitemap.xml/route.ts');
const episodeSeo = read('lib/episode-seo.ts');
const episodeRoute = read('app/anime/[slug]/episode/[episode]/page.tsx');
const episodeErrorBoundary = read('app/anime/[slug]/episode/[episode]/error.tsx');
const animeErrorBoundary = read('app/anime/[slug]/error.tsx');
const animeDetailPage = read('app/anime/[slug]/page.tsx');
const seoIndex = read('lib/seo-episode-index.ts');
const robots = read('app/robots.ts');
const timelineMigration = read(
  'supabase/migrations/20260923112710_episode_timeline_meta_v1.sql',
);
const videoViewMigration = read(
  'supabase/migrations/20260923112842_episode_video_seo_view_v1.sql',
);

for (const [label, needle] of [
  ['5 second local progress journal', 'LOCAL_PROGRESS_SAVE_INTERVAL_MS = 5_000'],
  ['automatic opening guard', 'openingAutoSkipAttemptedRef.current = true'],
  ['automatic opening seek', "requestOpeningSkip('auto', observedDurationSeconds)"],
  ['manual skip fallback UI', 'Пропустить опенинг'],
  ['provider duplicate skip suppression', 'pendingOpeningTarget != null &&'],
  ['opening seek watch-integrity signal', 'watchSession.onProviderSkip'],
  ['ending countdown UI', 'endingNextSeconds'],
  ['ending cancel action', 'cancelEndingAutoNext'],
]) {
  if (!player.includes(needle)) {
    failures.push(`AnimePlayer: missing ${label}.`);
  }
}

if (!episodePage.includes('/api/episodes/timeline')) {
  failures.push('AnimeEpisodePage: timeline metadata request is missing.');
}

if (!episodePage.includes('timeline={timeline}')) {
  failures.push('AnimeEpisodePage: timeline is not passed into AnimePlayer.');
}

for (const [label, needle] of [
  ['AniSkip v2 endpoint', 'api.aniskip.com/v2/skip-times'],
  ['server-side cache table', "from('episode_timeline_meta')"],
  ['Kodik player canonicalizer', 'canonicalEpisodePlayerUrl'],
  ['verified media timestamp', 'video_verified_at'],
]) {
  if (!timelineServer.includes(needle)) {
    failures.push(`episode timeline server: missing ${label}.`);
  }
}

if (!timelineApi.includes("scope: 'episode_timeline_ip'")) {
  failures.push('episode timeline API: IP rate limit is missing.');
}

for (const [label, needle] of [
  ['video namespace', 'xmlns:video='],
  ['thumbnail', '<video:thumbnail_loc>'],
  ['content location', '<video:content_loc>'],
  ['player location', '<video:player_loc'],
  ['50k hard cap', 'MAX_VIDEO_URLS = 50_000'],
]) {
  if (!videoSitemap.includes(needle)) {
    failures.push(`video sitemap: missing ${label}.`);
  }
}

if (!episodeSeo.includes('contentUrl') || !episodeSeo.includes('embedUrl')) {
  failures.push('VideoObject: verified contentUrl/embedUrl integration is missing.');
}

if (
  !episodeSeo.includes("console.warn('[episode-seo] availability resolution failed:'") ||
  !episodeSeo.includes("return { status: 'unknown', episodes: [] }")
) {
  failures.push('Episode SEO availability can still crash the route.');
}

if (
  !episodeRoute.includes("return <EpisodeRouteRecovery slug={slug} episode={number} />") ||
  !episodeRoute.includes("isEpisodeIndexable(anime.id, number).catch") ||
  !episodeRoute.includes("console.error('[Episode route] anime resolution failed:'")
) {
  failures.push('Episode server route is missing crash isolation.');
}

if (
  !episodeErrorBoundary.includes("'use client'") ||
  !episodeErrorBoundary.includes('onClick={reset}') ||
  !animeErrorBoundary.includes("'use client'") ||
  !animeErrorBoundary.includes('onClick={reset}')
) {
  failures.push('Anime route error boundaries are incomplete.');
}

if (
  !animeDetailPage.includes("console.error('[Anime metadata] title resolution failed:'") ||
  !animeDetailPage.includes("robots: { index: false, follow: true }")
) {
  failures.push('Anime detail metadata can still crash on upstream resolution failure.');
}

if (!seoIndex.includes("from('episode_timeline_meta')")) {
  failures.push('SEO episode sync: player URL timeline seed is missing.');
}

if (!robots.includes('/video-sitemap.xml')) {
  failures.push('robots.ts: video sitemap is not exposed.');
}

for (const [label, needle] of [
  ['timeline table', 'create table if not exists public.episode_timeline_meta'],
  ['timeline RLS', 'alter table public.episode_timeline_meta enable row level security'],
  ['opening range checks', 'opening_end_ms > opening_start_ms'],
  ['ending range checks', 'ending_end_ms > ending_start_ms'],
]) {
  if (!timelineMigration.includes(needle)) {
    failures.push(`timeline migration: missing ${label}.`);
  }
}

if (!videoViewMigration.includes('public.seo_video_episode_index')) {
  failures.push('video SEO projection migration is missing.');
}

if (failures.length) {
  console.error('\n[AnimeBox Smart Playback + Video SEO] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Smart Playback + Video SEO] Static invariants passed.');
