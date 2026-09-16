import type { MetadataRoute } from 'next';

import { getAnimes } from '@/lib/anilist';
import { slugify } from '@/lib/anime-url';
import { SITE_URL } from '@/lib/seo-config';
import type { Anime } from '@/types/anime';

export const revalidate = 60 * 60 * 6;

function stableAnimePath(anime: Anime): string {
  const title =
    anime.title?.romaji ||
    anime.title?.english ||
    anime.title?.native ||
    `anime-${anime.id}`;

  return `/anime/${slugify(title)}-${anime.id}`;
}

function uniqueAnime(items: Anime[]): Anime[] {
  const seen = new Set<number>();

  return items.filter((anime) => {
    if (!Number.isSafeInteger(anime.id) || anime.id <= 0 || seen.has(anime.id)) {
      return false;
    }

    seen.add(anime.id);
    return true;
  });
}

async function safeBatch(options: Parameters<typeof getAnimes>[0]): Promise<Anime[]> {
  try {
    return await getAnimes(options);
  } catch (error) {
    console.warn('Priority sitemap batch failed:', options, error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/schedule`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Root sitemap stays lightweight and prioritizes URLs Google should discover first.
  // The extended /anime/sitemap/[id].xml shards cover up to ~5,000 titles.
  const batches = await Promise.all([
    safeBatch({ page: 1, limit: 50, order: 'popularity' }),
    safeBatch({ page: 2, limit: 50, order: 'popularity' }),
    safeBatch({ page: 3, limit: 50, order: 'popularity' }),
    safeBatch({ page: 1, limit: 50, order: 'popularity', status: 'ongoing' }),
  ]);

  const animePages: MetadataRoute.Sitemap = uniqueAnime(batches.flat()).map(
    (anime) => ({
      url: `${SITE_URL}${stableAnimePath(anime)}`,
      changeFrequency:
        anime.status === 'RELEASING' || anime.status === 'Онгоинг'
          ? 'daily'
          : 'weekly',
      priority:
        anime.status === 'RELEASING' || anime.status === 'Онгоинг'
          ? 0.8
          : 0.7,
      images: [
        anime.bannerImage,
        anime.coverImage?.extraLarge,
        anime.coverImage?.large,
      ].filter((value): value is string => Boolean(value)),
    }),
  );

  return [...staticPages, ...animePages];
}
