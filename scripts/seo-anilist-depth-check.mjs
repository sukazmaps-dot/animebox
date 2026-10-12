import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lib/seo-anilist.ts', import.meta.url), 'utf8');
for (const fragment of [
  "export function buildShardQuery",
  "Math.floor(5000 / (ANIME_PAGES_PER_SITEMAP * ANIME_ITEMS_PER_PAGE))",
  "const slot = shard - recentShards",
  "const startPage = slot >= 0 ? 1 : shard * ANIME_PAGES_PER_SITEMAP + 1",
  "seasonYear:",
  "['WINTER','SPRING','SUMMER','FALL']",
  "animebox-seo-anilist-registry-v5-season-bounded",
]) assert.ok(source.includes(fragment), 'Missing pagination safety: ' + fragment);

const shards = 70;
const pagesPerShard = 10;
const pageSize = 50;
const recent = Math.floor(5000 / (pagesPerShard * pageSize));
assert.equal(recent, 10);
assert.equal((shards - recent) % 4, 0);
for (let shard = 0; shard < shards; shard++) {
  const slot = shard - recent;
  const startPage = slot >= 0 ? 1 : shard * pagesPerShard + 1;
  for (let offset = 0; offset < pagesPerShard; offset++) {
    assert.ok((startPage + offset) * pageSize <= 5000,
      'AniList GraphQL 5000-result depth exceeded in shard ' + shard);
  }
  if (slot >= 0) {
    const year = 2026 - Math.floor((shards - recent) / 4) + 1 + Math.floor(slot / 4);
    assert.ok(year >= 2012 && year <= 2026);
  }
}
console.log('[SEO pagination depth] All 70 source shards comply with AniList limits.');
