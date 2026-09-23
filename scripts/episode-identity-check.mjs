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

const layout = read('app/layout.tsx');
const episodeList = read('components/EpisodeList.tsx');
const watchServer = read('lib/watch-server.ts');
const episodesApi = read('app/api/community/episodes/route.ts');
const css = read('app/patch14-5-episode-identity.css');

const importNeedle = "import './patch14-5-episode-identity.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: Episode Identity stylesheet is not imported.');
}

const identityImport = layout.indexOf(importNeedle);
const patch15ImportNeedle = "import './patch15-title-accent.css';";
const patch15Import = layout.indexOf(patch15ImportNeedle);

if (identityImport < 0) {
  failures.push('layout.tsx: Episode Identity stylesheet import is missing.');
}

if (patch15Import >= 0 && patch15Import <= identityImport) {
  failures.push(
    'layout.tsx: Patch 15 title accent override must load after Episode Identity.',
  );
}

if (patch15Import < 0) {
  const lastCssImport = layout.lastIndexOf("import './");
  if (identityImport !== lastCssImport) {
    failures.push(
      'layout.tsx: Episode Identity must remain the final episode-layout CSS layer.',
    );
  }
}

for (const [label, needle] of [
  ['batch progress state', 'EpisodeWatchListResponse'],
  ['live watch progress listener', "window.addEventListener('watch-progress'"],
  ['current episode semantic', "aria-current={isCurrent ? 'page' : undefined}"],
  ['current episode auto positioning', "scrollIntoView({"],
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
