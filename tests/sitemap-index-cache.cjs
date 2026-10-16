// Static safety contract for the public sitemap index.
// Run with: node tests/sitemap-index-cache.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../app/sitemap-index.xml/route.ts'),
  'utf8',
);

assert.match(source, /export const dynamic = 'force-static'/);
assert.match(source, /export const revalidate = 3600/);
assert.match(source, /s-maxage=3600, stale-while-revalidate=86400/);
assert.match(source, /ANIME_SITEMAP_SHARDS/);
assert.match(source, /EPISODE_SITEMAP_SHARDS/);
assert.doesNotMatch(source, /(?:cookies\(|headers\(|getUser\(|getSession\(|createSupabaseAdmin\()/);
console.log('Public sitemap cache contract passed');
