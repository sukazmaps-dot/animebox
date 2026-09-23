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

const catalog = read('components/SearchCatalogClient.tsx');
const catalogCss = read('components/SearchCatalogClient.module.css');
const client = read('lib/anime-client.ts');
const api = read('app/api/anime/route.ts');
const anilist = read('lib/anilist.ts');

for (const [label, needle] of [
  ['format state', 'selectedFormat'],
  ['season state', 'selectedSeason'],
  ['announcement status', "'upcoming'"],
  ['anime filter heading', 'Аниме-фильтры'],
  ['format options', 'FORMAT_OPTIONS'],
  ['season options', 'SEASON_OPTIONS'],
]) {
  if (!catalog.includes(needle)) failures.push(`Catalog UI: missing ${label}.`);
}

for (const [label, needle] of [
  ['anime filter side', '.animeFilterSide'],
  ['compact choices', '.compactChoiceGrid'],
  ['status choices', '.statusChoices'],
]) {
  if (!catalogCss.includes(needle)) failures.push(`Catalog CSS: missing ${label}.`);
}

for (const [label, source, needle] of [
  ['client format serialization', client, "params.set('format'"],
  ['client season serialization', client, "params.set('season'"],
  ['API format parsing', api, "const formatRaw = params.get('format')"],
  ['API season parsing', api, "const seasonRaw = params.get('season')"],
  ['AniList format variable', anilist, '$formats: [MediaFormat]'],
  ['AniList season variable', anilist, '$season: MediaSeason'],
]) {
  if (!source.includes(needle)) failures.push(`Catalog filters: missing ${label}.`);
}

if (failures.length) {
  console.error('\n[AnimeBox Catalog Filters] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Catalog Filters] Anime-native filter invariants passed.');
