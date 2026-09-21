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


/**
 * Episode sitemap settings.
 *
 * Episode URLs are sourced from completed viewing history already stored by
 * AnimeBox. This keeps sitemap generation independent from AniList/Kodik and
 * naturally expands long-tail coverage as real episodes are watched.
 *
 * 20 shards × 5,000 history rows gives headroom for 100k completion records.
 * Duplicate user completions are collapsed inside each shard before URLs are
 * emitted, keeping each XML comfortably below the 50k URL sitemap limit.
 */
export const EPISODE_SITEMAP_SHARDS = 20;
export const EPISODE_HISTORY_ROWS_PER_SITEMAP = 5_000;
