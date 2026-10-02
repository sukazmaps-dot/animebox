import fs from 'node:fs';

const failures = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const need = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label);
};

const page = read('app/anime/[slug]/page.tsx');
const resume = read('components/AnimeDetailContinueWatching.tsx');
const controls = read('components/AnimeDetailControls.tsx');
const franchise = read('components/AnimeFranchise.tsx');
const analytics = read('lib/product-events-client.ts');
const watchTitleRoute = read('app/api/watch/title/[animeId]/route.ts');

need(
  page,
  "import AnimeDetailContinueWatching from '@/components/AnimeDetailContinueWatching';",
  'anime detail resume surface is not imported',
);
need(
  page,
  '<AnimeDetailContinueWatching',
  'anime detail resume surface is not rendered',
);
need(
  page,
  'showWatchAction={false}',
  'legacy AnimeDetailControls watch CTA is not disabled on the new detail surface',
);
need(
  page,
  "resolved.title.russian?.trim() ||",
  'anime page Russian title fallback is missing',
);
need(
  page,
  "resolved.title.english?.trim() ||",
  'anime page English title fallback is missing',
);
need(
  page,
  "resolved.title.romaji?.trim() ||",
  'anime page Romaji title fallback is missing',
);
need(
  page,
  "resolved.title.native?.trim() ||",
  'anime page native title fallback is missing',
);
need(
  page,
  "data-description-fallback={displayDescription ? undefined : 'true'}",
  'anime description empty-state fallback is missing',
);
need(
  page,
  'seoIdentity.pageHeading !== seoIdentity.title',
  'anime page heading does not preserve season context over display fallback',
);

need(
  resume,
  'getLatestWatchProgress(',
  'anime detail does not read local crash-resume state',
);
need(
  resume,
  'user?.id ?? null',
  'anime detail local resume is not scoped to the current identity',
);
need(
  resume,
  'fetch(\`/api/watch/title/\${animeId}\`',
  'anime detail does not reconcile exact server watch state',
);
need(
  resume,
  'localResume.updatedAt > remoteResume.updatedAt',
  'local/server resume freshness ownership is missing',
);
need(
  resume,
  'remoteUpdatedAt >= localResume.updatedAt',
  'newer server completion tombstone can resurrect stale local resume',
);
need(
  resume,
  'serverSnapshot.ownerId === user?.id',
  'server resume snapshot is not scoped to the authenticated owner',
);
need(
  resume,
  "'auth-loading'",
  'primary watch CTA does not reserve an auth-loading state',
);
need(
  resume,
  'if (!episodeConfirmed || authLoading)',
  'unconfirmed playback can still become a navigable detail CTA',
);
need(
  resume,
  'requestedEpisode <= availableEpisodes',
  'detail CTA does not verify the requested episode against confirmed availability',
);
need(
  resume,
  'const requestedEpisode = Math.max(1, resume?.episode ?? 1);',
  'fresh anime detail does not fall back to episode 1',
);
need(
  resume,
  'useEpisodeAvailability(anime)',
  'detail primary CTA is not bound to episode availability',
);
need(
  resume,
  'data-playback-state={',
  'detail primary CTA does not expose stable blocked/checking states',
);
need(
  resume,
  "'watch-progress'",
  'anime detail resume does not refresh from live watch progress',
);
need(
  resume,
  "source: 'anime_detail_continue'",
  'anime detail continue analytics source is missing',
);
need(
  resume,
  'rememberContinueWatchingAttribution({',
  'anime detail continue attribution is missing',
);

need(
  controls,
  'showWatchAction = true',
  'legacy controls lost backward-compatible watch action default',
);
need(
  controls,
  'showWatchAction || showEpisodes',
  'detail secondary controls still own a redundant availability request',
);
need(
  controls,
  '{showWatchAction && (',
  'legacy primary watch action is not explicitly suppressible',
);

need(
  watchTitleRoute,
  'getTitleWatchOverviews(user.id, [animeId])',
  'exact watch title route does not use authoritative title overview',
);
need(
  watchTitleRoute,
  'return response({ item });',
  'exact watch title route response contract is missing',
);

need(
  analytics,
  'source?: string;',
  'continue attribution does not preserve source',
);
need(
  analytics,
  "source: input.source?.trim() || 'home_continue'",
  'continue attribution source is not persisted',
);
need(
  analytics,
  "source: parsed.source?.trim() || 'home_continue'",
  'continue started event does not restore attribution source',
);

need(
  franchise,
  'const previousSeason =',
  'previous franchise season resolution is missing',
);
need(
  franchise,
  'const nextSeason =',
  'next franchise season resolution is missing',
);
need(
  franchise,
  'Предыдущая часть',
  'previous franchise navigation is missing',
);
need(
  franchise,
  'Следующая часть →',
  'next franchise navigation is missing',
);
need(
  franchise,
  'function franchiseTitle(',
  'franchise display fallback helper is missing',
);

if (failures.length) {
  console.error('\n[AnimeBox Patch 26 Anime Page 2.0] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Patch 26 Anime Page 2.0] Resume, franchise navigation and display fallbacks passed.');
