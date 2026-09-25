import { unstable_cache } from 'next/cache';

import { fetchWithRetry } from '@/lib/fetch-retry';
import { stableAnimeSlug } from '@/lib/anime-url';
import {
  ANIME_ITEMS_PER_PAGE,
  ANIME_PAGES_PER_SITEMAP,
  ANIME_SITEMAP_SHARDS,
} from '@/lib/seo-config';

const ANILIST_API_URL = 'https://graphql.anilist.co';
const CACHE_SECONDS = 60 * 60 * 12;

type SeoAniListMedia = {
  id?: number;
  status?: string | null;
  format?: string | null;
  updatedAt?: number | null;
  description?: string | null;
  episodes?: number | null;
  genres?: string[] | null;
  startDate?: {
    year?: number | null;
  } | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  coverImage?: {
    large?: string | null;
    extraLarge?: string | null;
  } | null;
  bannerImage?: string | null;
};

type SeoAniListResponse = {
  data?: Record<
    string,
    {
      media?: SeoAniListMedia[] | null;
    } | null
  >;
  errors?: Array<{ message?: string }>;
};

export type SeoAnimeSourceEntry = {
  id: number;
  status: string | null;
  format: string | null;
  updatedAt: number | null;
  description: string | null;
  episodes: number | null;
  genres: string[];
  startDate: {
    year: number | null;
  };
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  image: string | null;
  slug: string;
};

function buildShardQuery(shard: number): string {
  const startPage = shard * ANIME_PAGES_PER_SITEMAP + 1;
  const pages = Array.from(
    { length: ANIME_PAGES_PER_SITEMAP },
    (_, index) => startPage + index,
  );

  const selections = pages
    .map(
      (page, index) => `
        p${index}: Page(page: ${page}, perPage: ${ANIME_ITEMS_PER_PAGE}) {
          media(
            type: ANIME
            isAdult: false
            format_in: [TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL]
            sort: ID_DESC
          ) {
            id
            status
            format
            updatedAt
            description(asHtml: false)
            episodes
            genres
            startDate { year }
            title { romaji english native }
            coverImage { large extraLarge }
            bannerImage
          }
        }
      `,
    )
    .join('\n');

  return `query AnimeBoxSeoRegistry { ${selections} }`;
}

async function loadSeoAnimeSourceShard(
  shard: number,
): Promise<SeoAnimeSourceEntry[]> {
  const response = await fetchWithRetry(
    ANILIST_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: buildShardQuery(shard) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    },
    3,
    900,
  );

  if (!response.ok) {
    throw new Error(`AniList SEO registry HTTP ${response.status}`);
  }

  const json = (await response.json()) as SeoAniListResponse;

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList SEO registry error');
  }

  const seen = new Set<number>();
  const result: SeoAnimeSourceEntry[] = [];

  for (const page of Object.values(json.data ?? {})) {
    for (const media of page?.media ?? []) {
      const id = Number(media?.id);

      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
        continue;
      }

      const title = {
        romaji: media.title?.romaji?.trim() || null,
        english: media.title?.english?.trim() || null,
        native: media.title?.native?.trim() || null,
      };
      const canonicalTitle =
        title.romaji || title.english || title.native || `anime-${id}`;

      seen.add(id);
      result.push({
        id,
        status: media.status ?? null,
        format: media.format ?? null,
        updatedAt:
          typeof media.updatedAt === 'number' && media.updatedAt > 0
            ? media.updatedAt
            : null,
        description: media.description?.trim() || null,
        episodes:
          typeof media.episodes === 'number' && media.episodes > 0
            ? media.episodes
            : null,
        genres: Array.isArray(media.genres)
          ? media.genres.filter(
              (value): value is string =>
                typeof value === 'string' && value.trim().length > 0,
            )
          : [],
        startDate: {
          year:
            typeof media.startDate?.year === 'number'
              ? media.startDate.year
              : null,
        },
        title,
        image:
          media.bannerImage?.trim() ||
          media.coverImage?.extraLarge?.trim() ||
          media.coverImage?.large?.trim() ||
          null,
        slug: stableAnimeSlug(id, canonicalTitle),
      });
    }
  }

  return result;
}

const getCachedSeoAnimeSourceShard = unstable_cache(
  async (shard: number) => loadSeoAnimeSourceShard(shard),
  ['animebox-seo-anilist-registry-v4'],
  {
    revalidate: CACHE_SECONDS,
  },
);

export async function getSeoAnimeSourceShard(
  shard: number,
): Promise<SeoAnimeSourceEntry[]> {
  if (
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= ANIME_SITEMAP_SHARDS
  ) {
    return [];
  }

  return getCachedSeoAnimeSourceShard(shard);
}
