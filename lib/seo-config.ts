export const SITE_URL = 'https://youranimebox.com';

/**
 * Long-tail anime SEO registry settings.
 *
 * 70 stable sitemap buckets keep each XML comfortably bounded. Crawlers read
 * only Supabase-backed seo_anime_index rows; they never trigger AniList work.
 *
 * The legacy-named page/item constants now describe one background AniList
 * source shard: 10 aliased pages × 50 records = at most 500 verification
 * candidates. A daily cron advances through those source shards separately
 * from crawler traffic.
 */
export const ANIME_SITEMAP_SHARDS = 70;
export const ANIME_PAGES_PER_SITEMAP = 10;
export const ANIME_ITEMS_PER_PAGE = 50;


/**
 * Episode sitemap settings.
 *
 * Episode URLs are sourced from the server-maintained seo_episode_index.
 * Provider availability confirms that a route is actually playable before it
 * becomes indexable, so external outages fail closed instead of generating
 * thin/non-playable episode URLs.
 *
 * 20 shards × 5,000 rows gives headroom for 100k confirmed episode URLs while
 * keeping every XML comfortably below the 50k URL sitemap limit.
 */
export const EPISODE_SITEMAP_SHARDS = 20;
export const EPISODE_HISTORY_ROWS_PER_SITEMAP = 5_000;
