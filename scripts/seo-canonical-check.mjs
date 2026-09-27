import fs from 'node:fs';

const animePage = fs.readFileSync('app/anime/[slug]/page.tsx', 'utf8');
const episodePage = fs.readFileSync(
  'app/anime/[slug]/episode/[episode]/page.tsx',
  'utf8',
);
const searchPage = fs.readFileSync('app/search/page.tsx', 'utf8');
const watchTogetherPage = fs.readFileSync(
  'app/watch-together/[slug]/episode/[episode]/page.tsx',
  'utf8',
);
const sitemapIndex = fs.readFileSync(
  'app/sitemap-index.xml/route.ts',
  'utf8',
);

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

assertIncludes(
  animePage,
  'alternates: { canonical: canonicalUrl }',
  'Anime page canonical contract missing.',
);
assertIncludes(
  episodePage,
  'alternates: { canonical }',
  'Episode page canonical contract missing.',
);
assertIncludes(
  searchPage,
  "alternates: { canonical: '/search' }",
  'Search canonical must collapse filter/query variants to /search.',
);
assertIncludes(
  searchPage,
  '? { index: false, follow: true }',
  'Dynamic search/filter variants must remain noindex.',
);
assertIncludes(
  watchTogetherPage,
  'index: false',
  'Watch Together routes must remain noindex.',
);
assertIncludes(
  sitemapIndex,
  '/sitemap-recent.xml',
  'Recent sitemap must be advertised in sitemap index.',
);
assertIncludes(
  sitemapIndex,
  '/video-sitemap.xml',
  'Video sitemap must remain advertised in sitemap index.',
);

if (/window\.location\.(?:href|assign|replace)\s*=/.test(episodePage)) {
  throw new Error('Episode SEO route must not introduce document-level redirects.');
}

console.log('SEO canonical integrity checks OK');
