import {
  ANIME_SITEMAP_SHARDS,
  EPISODE_SITEMAP_SHARDS,
  SITE_URL,
} from '@/lib/seo-config';

export const runtime = 'nodejs';
// The index only contains public, deployment-stable sitemap URLs.
// Opt in to static route caching; shard content is refreshed by its own handlers.
export const dynamic = 'force-static';
export const revalidate = 3600;

function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET() {
  const sitemaps = [
    `${SITE_URL}/sitemap.xml`,
    `${SITE_URL}/sitemap-recent.xml`,
    `${SITE_URL}/video-sitemap.xml`,
    ...Array.from(
      { length: ANIME_SITEMAP_SHARDS },
      (_, id) => `${SITE_URL}/anime/sitemap/${id}.xml`,
    ),
    ...Array.from(
      { length: EPISODE_SITEMAP_SHARDS },
      (_, id) => `${SITE_URL}/episodes/sitemap/${id}.xml`,
    ),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map((url) => `  <sitemap><loc>${xml(url)}</loc></sitemap>`)
  .join('\n')}
</sitemapindex>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
