import { fetchWithRetry } from '@/lib/fetch-retry';
import {
  ANIME_ITEMS_PER_PAGE,
  ANIME_PAGES_PER_SITEMAP,
  ANIME_SITEMAP_SHARDS,
} from '@/lib/seo-config';

const ANILIST_API_URL = 'https://graphql.anilist.co';

type SeoAniListMedia = {
  id?: number;
  status?: string | null;
  updatedAt?: number | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  coverImage?: {
    large?: string | null;
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

export type SeoAnimeEntry = {
  id: number;
  status: string | null;
  updatedAt: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  image: string | null;
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
            sort: POPULARITY_DESC
          ) {
            id
            status
            updatedAt
            title { romaji english native }
            coverImage { large }
            bannerImage
          }
        }
      `,
    )
    .join('\n');

  return `query AnimeBoxSeoSitemap { ${selections} }`;
}

export async function getSeoAnimeShard(shard: number): Promise<SeoAnimeEntry[]> {
  if (
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= ANIME_SITEMAP_SHARDS
  ) {
    return [];
  }

  const response = await fetchWithRetry(ANILIST_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: buildShardQuery(shard) }),
    next: {
      // Sitemap data does not need minute-by-minute refreshes.
      revalidate: 60 * 60 * 6,
    },
  });

  if (!response.ok) {
    throw new Error(`AniList SEO sitemap HTTP ${response.status}`);
  }

  const json = (await response.json()) as SeoAniListResponse;

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList SEO sitemap error');
  }

  const seen = new Set<number>();
  const result: SeoAnimeEntry[] = [];

  for (const page of Object.values(json.data ?? {})) {
    for (const media of page?.media ?? []) {
      const id = Number(media?.id);

      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
        continue;
      }

      seen.add(id);
      result.push({
        id,
        status: media.status ?? null,
        updatedAt:
          typeof media.updatedAt === 'number' && media.updatedAt > 0
            ? media.updatedAt
            : null,
        title: {
          romaji: media.title?.romaji?.trim() || null,
          english: media.title?.english?.trim() || null,
          native: media.title?.native?.trim() || null,
        },
        image:
          media.bannerImage?.trim() ||
          media.coverImage?.large?.trim() ||
          null,
      });
    }
  }

  return result;
}
