import type { MetadataRoute } from 'next';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { animeHref } from '@/lib/anime-url';

const SITE_URL = 'https://youranimebox.com';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/schedule`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  try {
    /*
     * Стартовый sitemap добавляет самые популярные тайтлы.
     * Внешний API может временно не отвечать — в таком случае sitemap
     * всё равно остаётся валидным и содержит статические страницы.
     */
    const anime = await getAnimesWithShikimori({
      limit: 50,
      page: 1,
      order: 'popularity',
    });

    const animePages: MetadataRoute.Sitemap = anime.map((item) => ({
      url: `${SITE_URL}${animeHref(item)}`,
      lastModified: now,
      changeFrequency: item.status === 'Онгоинг' || item.status === 'RELEASING' ? 'daily' : 'weekly',
      priority: 0.7,
      images: [
        item.coverImage?.extraLarge,
        item.coverImage?.large,
      ].filter((value): value is string => Boolean(value)),
    }));

    return [...staticPages, ...animePages];
  } catch (error) {
    console.warn('Anime sitemap generation failed:', error);
    return staticPages;
  }
}
