import { unstable_cache } from 'next/cache';

import {
  ANIME_ITEMS_PER_PAGE,
  ANIME_PAGES_PER_SITEMAP,
  ANIME_SITEMAP_SHARDS,
} from '@/lib/seo-config';

const ANILIST_API_URL = 'https://graphql.anilist.co';
const CACHE_SECONDS = 60 * 60 * 12;
const MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1_500;
const MAX_RETRY_DELAY_MS = 15_000;

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
            sort: ID_DESC
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isFinite(retryDate)) {
      return Math.min(
        Math.max(retryDate - Date.now(), 0),
        MAX_RETRY_DELAY_MS,
      );
    }
  }

  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** attempt,
    MAX_RETRY_DELAY_MS,
  );
}

async function fetchAniListForSitemap(query: string): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
      // Result caching is handled by unstable_cache below. Keeping this fetch
      // uncached prevents multiple cache layers from fighting each other.
      cache: 'no-store',
    });

    lastResponse = response;

    if (response.ok) {
      return response;
    }

    const temporaryFailure = response.status === 429 || response.status >= 500;

    if (!temporaryFailure || attempt === MAX_ATTEMPTS - 1) {
      return response;
    }

    const delay = retryDelayMs(response, attempt);
    console.warn(
      `AniList SEO sitemap HTTP ${response.status}; retrying in ${delay}ms ` +
        `(attempt ${attempt + 2}/${MAX_ATTEMPTS})`,
    );
    await sleep(delay);
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw new Error('AniList SEO sitemap request did not produce a response');
}

async function loadSeoAnimeShard(shard: number): Promise<SeoAnimeEntry[]> {
  const response = await fetchAniListForSitemap(buildShardQuery(shard));

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

const getCachedSeoAnimeShard = unstable_cache(
  async (shard: number) => loadSeoAnimeShard(shard),
  ['animebox-seo-anilist-shard-v3-longtail'],
  {
    revalidate: CACHE_SECONDS,
  },
);

export async function getSeoAnimeShard(shard: number): Promise<SeoAnimeEntry[]> {
  if (
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= ANIME_SITEMAP_SHARDS
  ) {
    return [];
  }

  return getCachedSeoAnimeShard(shard);
}
