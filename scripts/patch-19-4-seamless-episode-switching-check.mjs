import fs from 'node:fs';

const page = fs.readFileSync('components/AnimeEpisodePage.tsx', 'utf8');
const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const kodik = fs.readFileSync('components/KodikPlayer.tsx', 'utf8');
const episodeList = fs.readFileSync('components/EpisodeList.tsx', 'utf8');
const wtPage = fs.readFileSync(
  'app/watch-together/[slug]/episode/[episode]/page.tsx',
  'utf8',
);
const events = fs.readFileSync('lib/product-event-names.ts', 'utf8');

for (const needle of [
  'activeEpisodeNumber',
  'setActiveEpisodeNumber',
  'window.history.pushState',
  'sourceDiscoverySequenceRef',
  'playerEpisodeNumber',
  'episodeTransitionPending',
  'isFirstPlayableSource ? [] : current',
  'player_episode_switch_stale_ignored',
  'sources.length === 0 ?',
]) {
  if (!page.includes(needle)) {
    throw new Error(`Patch 19.4 retained page invariant missing: ${needle}`);
  }
}

if (page.includes('key={expectedSourceIdentity}')) {
  throw new Error('Patch 19.4 forced AnimePlayer episode remount returned.');
}

if (page.includes('key={`${expectedSourceIdentity}:theater`}')) {
  throw new Error('Patch 19.4 forced Watch Together player remount returned.');
}

if (wtPage.includes('episodeNumber}:watch-together')) {
  throw new Error('Patch 19.4 Watch Together page is still keyed by episode.');
}

if (!wtPage.includes('key={anime.slug}')) {
  throw new Error('Patch 19.4 stable Watch Together page key missing.');
}

for (const needle of [
  'episodeTransitionPending?: boolean',
  'episodeTransitionMessage?: string',
  'data-player-episode-transition',
  'episodeSwitchSequenceRef',
  'episodeSwitchRef',
  'resumeAfterEpisodeSwitchRef',
  'playIntentRef',
  'changeEpisode: changePlaybackEpisode',
  'playbackController.changeEpisode(episodeNumber)',
  'player_episode_switch_ready',
  'player_episode_switch_ms',
  'player_episode_switch_failed',
]) {
  if (!player.includes(needle)) {
    throw new Error(`Patch 19.4 player transaction invariant missing: ${needle}`);
  }
}

for (const legacyKey of [
  'key={`${videoLink}:${playerAttempt}`}',
]) {
  if (player.includes(legacyKey)) {
    throw new Error(
      'Patch 19.4 media URL must not be a component remount key.',
    );
  }
}

for (const key of [
  'key={`kodik:${currentSource?.name || "source"}:${playerAttempt}`}',
  'key={`direct:${playerAttempt}`}',
  'key={`iframe:${playerAttempt}`}',
]) {
  if (!player.includes(key)) {
    throw new Error(`Patch 19.4 stable engine key missing: ${key}`);
  }
}

for (const needle of [
  "nextUrl.searchParams.delete('episode')",
  'const playerSrc = useMemo(',
  '() => buildPlayerUrl(src)',
  '[src]',
  'episodeChangePendingRef',
  "postApiCommand('change_episode'",
  'without_reload: true',
]) {
  if (!kodik.includes(needle)) {
    throw new Error(`Patch 19.4 Kodik seamless invariant missing: ${needle}`);
  }
}

if (kodik.includes('buildPlayerUrl(src, episodeNumber)')) {
  throw new Error('Patch 19.4 Kodik iframe src still depends on episode.');
}

for (const needle of [
  'onEpisodeNavigate?: (episode: number) => void',
  'event.preventDefault()',
  'onEpisodeNavigate(number)',
  'onEpisodeNavigate(target)',
]) {
  if (!episodeList.includes(needle)) {
    throw new Error(`Patch 19.4 EpisodeList seamless navigation missing: ${needle}`);
  }
}

for (const eventName of [
  "'player_episode_switch_started'",
  "'player_episode_switch_ready'",
  "'player_episode_switch_failed'",
  "'player_episode_switch_ms'",
  "'player_episode_switch_stale_ignored'",
  "'player_episode_prefetch'",
]) {
  if (!events.includes(eventName)) {
    throw new Error(`Patch 19.4 telemetry event missing: ${eventName}`);
  }
}

if (!player.includes('useWatchSession({') ||
    !player.includes('episode: episodeNumber')) {
  throw new Error('Patch 19.4 heartbeat episode scoping regressed.');
}

console.log('Patch 19.4 seamless episode switching invariants OK');
