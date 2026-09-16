export const SITE_URL = 'https://youranimebox.com';

/**
 * Extended anime sitemap settings.
 *
 * Each shard contains 5 AniList pages x 50 items = up to 250 URLs.
 * 20 shards cover up to 5,000 popular titles without making one enormous
 * request or one enormous sitemap.
 */
export const ANIME_SITEMAP_SHARDS = 20;
export const ANIME_PAGES_PER_SITEMAP = 5;
export const ANIME_ITEMS_PER_PAGE = 50;
