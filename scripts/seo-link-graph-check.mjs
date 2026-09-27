import fs from 'node:fs';

const episodeList = fs.readFileSync('components/EpisodeList.tsx', 'utf8');
const franchise = fs.readFileSync('components/AnimeFranchise.tsx', 'utf8');
const episodePage = fs.readFileSync(
  'app/anime/[slug]/episode/[episode]/page.tsx',
  'utf8',
);

for (const needle of [
  '<Link',
  '/anime/${selectedAnimeSlug}/episode/${number}',
]) {
  if (!episodeList.includes(needle)) {
    throw new Error('EpisodeList lost crawlable episode hrefs: ' + needle);
  }
}

for (const needle of [
  'href={animeHref(item)}',
  'Сезоны и части франшизы',
]) {
  if (!franchise.includes(needle)) {
    throw new Error('Franchise crawl graph invariant missing: ' + needle);
  }
}

for (const needle of [
  "'@type': 'BreadcrumbList'",
  "item: `${SITE_URL}${animeHref(anime)}`",
  "item: canonical",
]) {
  if (!episodePage.includes(needle)) {
    throw new Error('Episode breadcrumb graph invariant missing: ' + needle);
  }
}

console.log('SEO internal link graph checks OK');
