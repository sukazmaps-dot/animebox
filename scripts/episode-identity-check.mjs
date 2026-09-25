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

const layout = read('app/anime/[slug]/layout.tsx');
const episodeList = read('components/EpisodeList.tsx');
const watchServer = read('lib/watch-server.ts');
const episodesApi = read('app/api/community/episodes/route.ts');
const css = read('app/patch14-5-episode-identity.css');

const importNeedle =
  "import '../../patch14-5-episode-identity.css';";
const replayNeedle =
  "import '../../patch18-4-6-episode-cascade.css';";

if (!layout.includes(importNeedle)) {
  failures.push(
    'anime layout: Episode Identity stylesheet is not route-scoped.',
  );
}

if (!layout.includes(replayNeedle)) {
  failures.push(
    'anime layout: Episode Identity cascade replay is missing.',
  );
}

const identityImport = layout.indexOf(importNeedle);
const replayImport = layout.indexOf(replayNeedle);
const playerRuntimeImport = layout.indexOf(
  "import '../../patch17-6-player-runtime.css';",
);

if (
  identityImport < 0 ||
  replayImport <= identityImport ||
  (playerRuntimeImport >= 0 &&
    playerRuntimeImport <= replayImport)
) {
  failures.push(
    'anime layout: Episode Identity must load before its replay and player runtime layers.',
  );
}

for (const [label, needle] of [
  ['batch progress state', 'EpisodeWatchListResponse'],
  ['live watch progress listener', "window.addEventListener('watch-progress'"],
  ['current episode semantic', "aria-current={isCurrent ? 'page' : undefined}"],
  ['current episode internal auto positioning', 'itemTop = current.offsetTop'],
  ['current episode container scroll', 'list.scrollTo({'],
  ['group tab container scroll', 'track.scrollTo({'],
  ['partial episode state', "'is-partial'"],
  ['progress bar', 'episode-list__progress'],
  ['human status completed', "'Завершено'"],
  ['human status current', "'Сейчас'"],
  ['desktop episode jump', 'submitEpisodeJump'],
  ['desktop jump input', 'episode-list__jump'],
]) {
  if (!episodeList.includes(needle)) {
    failures.push(`EpisodeList: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['batch watch reader', 'export async function getEpisodeWatchList'],
  ['effective coverage', 'effectiveWatchProgress('],
  ['chunked progress query', "from('progress')"],
]) {
  if (!watchServer.includes(needle)) {
    failures.push(`watch-server: missing ${label}.`);
  }
}

if (!episodesApi.includes('getEpisodeWatchList') || !episodesApi.includes('progress')) {
  failures.push('community episodes API: batched watch progress response is missing.');
}

for (const [label, needle] of [
  ['desktop navigator grid', 'grid-template-columns: repeat(auto-fill, minmax(205px, 1fr))'],
  ['desktop vertical overflow', 'overflow-y: auto !important'],
  ['desktop jump controls', '.episode-list__jump'],
  ['mobile vertical timeline', 'flex-direction: column !important'],
  ['current Iris marker', '.episode-list__item.is-current .episode-list__marker'],
  ['completed state', '.episode-list__item.is-watched'],
  ['partial state', '.episode-list__item.is-partial'],
  ['flat season tabs', ".episode-list__season-tab[aria-selected='true']"],
  ['long-show group tabs', '.episode-list__group-tab'],
]) {
  if (!css.includes(needle)) {
    failures.push(`Episode Identity CSS: missing ${label}.`);
  }
}

if (episodeList.includes('scrollIntoView(')) {
  failures.push(
    'EpisodeList: document-level scrollIntoView must not return; use container-only scrolling.',
  );
}

if (episodeList.includes('canScrollGroupLeft') || episodeList.includes('canScrollGroupRight')) {
  failures.push('EpisodeList: legacy desktop group-arrow state remains.');
}

if (failures.length) {
  console.error('\n[AnimeBox Episode Identity] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Episode Identity] Static invariants passed.');
