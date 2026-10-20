import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const related = read('components/RelatedAnime.tsx');
const title = read('app/anime/[slug]/page.tsx');
const card = read('components/AnimeCard.tsx');
const poster = read('components/AnimePoster.tsx');
const cascade = read('components/AnimeImageCascade.tsx');
const franchise = read('components/AnimeFranchise.tsx');
const rail = read('components/AnimeFranchise.module.css');
const layout = read('app/anime/[slug]/detail-layout.module.css');
const synopsis = read('components/AnimeSynopsis.tsx');
const synopsisCss = read('components/AnimeSynopsis.module.css');

for (const [path, source] of [
  ['components/RelatedAnime.tsx', related],
  ['components/AnimePoster.tsx', poster],
  ['components/AnimeImageCascade.tsx', cascade],
  ['components/AnimeFranchise.tsx', franchise],
  ['app/anime/[slug]/page.tsx', title],
  ['components/AnimeCard.tsx', card],
  ['components/AnimeSynopsis.tsx', synopsis],
]) {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length, 0,
    `${path}: invalid TSX syntax: ${parsed.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
}

assert(related.includes('getAnimeRecommendationsById(animeId'), 'title graph must be keyed to anime ID');
assert(related.includes('genres: displayGenres.slice(0, 3)'), 'multi-genre candidates required');
assert(related.includes('matchingGenres === 0 && matchingTags === 0'), 'taxonomy relevance gate missing');
assert(!related.includes("order: 'ranked'"), 'generic top-rated recommendations may not replace matches');
assert(related.includes('uniqueWithoutCurrent'), 'same anime must be excluded');
assert(related.includes('key={animeId}'), 'similar rail state must reset between anime pages');
assert(title.includes('genres={resolved.genres}'), 'current title genres not passed');
assert(card.includes('<AnimeImage'), 'legacy cards retain the reliable poster renderer');
assert(franchise.includes('<AnimePoster'), 'franchise cards must use the shared 2:3 poster');
assert(poster.includes("aspectRatio: '2 / 3'"), 'poster aspect ratio missing');
assert(poster.includes("rounded-[8px]"), 'poster radius missing');
assert(poster.includes("onStateChange={setState}"), 'poster skeleton is not tied to real load state');
assert(poster.includes('<AnimeImage'), 'poster must reuse existing CDN/fallback/retry engine');
// Retry now lives in the same source-keyed state as index/loaded; executable
// bounded-retry coverage is in poster-responsive-recovery.cjs.
assert(cascade.includes('retryCount: 1') && cascade.includes('retryCount >= 1'), 'bounded hero retry missing');
assert(cascade.includes('8_500'), 'hero timeout missing');
assert(franchise.includes('Связанные сезоны пока не найдены'), 'franchise empty state missing');
assert(franchise.includes('watchHref'), 'watch-route fallback missing');
assert(franchise.includes('maxRequests: 16'), 'description and watch franchise traversal budgets differ');
assert(rail.includes('overflow: hidden') && rail.includes('width: 100% !important'), 'rail containment missing');
assert(layout.includes('grid-template-columns: minmax(0, 1fr)'), 'min-content grid overflow not fixed');
assert(synopsis.includes('expanded || !collapsible ? styles.full : styles.preview'), 'hero excerpt cannot expand/collapse correctly');
assert(synopsisCss.includes('.hero .preview { -webkit-line-clamp: 4; }'), 'hero four-line synopsis missing');

console.log('[AnimeBox 30.1] Related relevance, image recovery and mobile geometry source contracts pass.');
