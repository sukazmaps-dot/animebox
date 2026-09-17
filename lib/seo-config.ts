export const SITE_URL = 'https://youranimebox.com';

/**
 * Long-tail anime sitemap settings.
 *
 * 70 shards × 10 AniList pages × 50 entries = capacity for up to 35,000
 * non-adult anime URLs. The catalogue is ordered by AniList id instead of
 * popularity, so obscure/older titles are discoverable too.
 *
 * Shards are generated on demand (not during `next build`) and cached by
 * lib/seo-anilist.ts, keeping the first-100-users stage inexpensive.
 */
export const ANIME_SITEMAP_SHARDS = 70;
export const ANIME_PAGES_PER_SITEMAP = 10;
export const ANIME_ITEMS_PER_PAGE = 50;
