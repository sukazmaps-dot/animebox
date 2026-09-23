import { registerAnime } from '@/lib/anime-registry';
import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { fetchWithRetry } from '@/lib/fetch-retry';
import { isCatalogAnime } from '@/lib/catalog-filter';
import {
  privateNoStoreHeaders,
  publicApiCacheHeaders,
} from '@/lib/edge-cache-policy';

const ANILIST_API_URL =
  'https://graphql.anilist.co';

const SHIKIMORI_API =
  'https://shikimori.one/api';

const SHIKIMORI_HEADERS = {
  'User-Agent': 'AnimeBox/1.0',
  Accept: 'application/json',
};

const DAY_SECONDS =
  60 * 60 * 24;

const MAX_RANGE_SECONDS =
  DAY_SECONDS * 10;

type ShikimoriAnime = {
  id?: number;
  russian?: string | null;
};

type AniListScheduleMedia = {
  id: number;
  idMal?: number | null;

  type?: string | null;
  format?: string | null;
  status?: string | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean | null;

  tags?: Array<{
    name?: string | null;
  } | null> | null;

  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;

  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
    color?: string | null;
  } | null;

  bannerImage?: string | null;
};

type AniListScheduleItem = {
  id: number;
  airingAt: number;
  episode: number;
  media?: AniListScheduleMedia | null;
};

type AniListScheduleResponse = {
  data?: {
    Page?: {
      pageInfo?: {
        currentPage?: number | null;
        hasNextPage?: boolean | null;
      } | null;

      airingSchedules?:
        | Array<
            AniListScheduleItem | null
          >
        | null;
    } | null;
  };

  errors?: Array<{
    message?: string;
  }>;
};

const SCHEDULE_QUERY = `
  query AnimeSchedule(
    $page: Int
    $perPage: Int
    $from: Int
    $to: Int
  ) {
    Page(
      page: $page
      perPage: $perPage
    ) {
      pageInfo {
        currentPage
        hasNextPage
      }

      airingSchedules(
        airingAt_greater: $from
        airingAt_lesser: $to
        sort: TIME
      ) {
        id
        airingAt
        episode

        media {
          id
          idMal
          type
          format
          status
          countryOfOrigin
          isAdult

          tags {
            name
          }

          title {
            romaji
            english
            native
          }

          coverImage {
            extraLarge
            large
            medium
            color
          }

          bannerImage
        }
      }
    }
  }
`;

function parseTimestamp(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

async function getRussianTitles(
  malIds: number[],
): Promise<Map<number, string>> {
  const result =
    new Map<number, string>();

  const uniqueIds =
    Array.from(
      new Set(
        malIds.filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0,
        ),
      ),
    );

  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += 30
  ) {
    const batch =
      uniqueIds.slice(
        offset,
        offset + 30,
      );

    if (
      batch.length === 0
    ) {
      continue;
    }

    const params =
      new URLSearchParams({
        ids: batch.join(','),
        limit: String(
          batch.length,
        ),
      });

    try {
      const response =
        await fetchWithRetry(
          `${SHIKIMORI_API}/animes?${params.toString()}`,
          {
            headers:
              SHIKIMORI_HEADERS,

            next: {
              revalidate: 3600,
            },
          },
        );

      if (!response.ok) {
        console.warn(
          `Shikimori schedule HTTP ${response.status}`,
        );

        continue;
      }

      const data =
        (await response.json()) as
          ShikimoriAnime[];

      if (
        !Array.isArray(data)
      ) {
        continue;
      }

      for (
        const anime of data
      ) {
        if (
          typeof anime.id !==
            'number' ||
          !anime.russian?.trim()
        ) {
          continue;
        }

        result.set(
          anime.id,
          anime.russian.trim(),
        );
      }
    } catch (error) {
      console.warn(
        'Shikimori schedule localization failed:',
        error,
      );
    }
  }

  return result;
}

export const runtime =
  'nodejs';

export async function GET(
  request: NextRequest,
) {
  const now =
    Math.floor(
      Date.now() / 1000,
    );

  const fromParam =
    parseTimestamp(
      request.nextUrl.searchParams.get(
        'from',
      ),
    );

  const toParam =
    parseTimestamp(
      request.nextUrl.searchParams.get(
        'to',
      ),
    );

  const from =
    fromParam ??
    now - DAY_SECONDS;

  const to =
    toParam ??
    now +
      DAY_SECONDS * 8;

  if (to <= from) {
    return NextResponse.json(
      {
        error:
          '`to` должен быть больше `from`',
      },
      {
        status: 400,
      },
    );
  }

  if (
    to - from >
    MAX_RANGE_SECONDS
  ) {
    return NextResponse.json(
      {
        error:
          'Слишком большой диапазон расписания',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const items:
      AniListScheduleItem[] =
      [];

    let page = 1;
    let hasNextPage = true;

    while (
      hasNextPage &&
      page <= 10
    ) {
      const response =
        await fetchWithRetry(
          ANILIST_API_URL,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                query:
                  SCHEDULE_QUERY,

                variables: {
                  page,
                  perPage: 50,
                  from,
                  to,
                },
              }),

            next: {
              revalidate: 300,
            },
          },
        );

      if (!response.ok) {
        const responseText = await response.text();

        console.error(
        `ANILIST_DEBUG status=${response.status} statusText=${response.statusText} body=${responseText.slice(0, 500)}`,
        );

        throw new Error(
         `AniList HTTP ${response.status}: ${responseText.slice(0, 200)}`,
        );
    }

      const json =
        (await response.json()) as
          AniListScheduleResponse;

      if (
        json.errors?.length
      ) {
        throw new Error(
          json.errors[0]
            ?.message ??
            'AniList GraphQL error',
        );
      }

      const pageData =
        json.data?.Page;

      const schedules =
        pageData
          ?.airingSchedules ??
        [];

      for (
        const schedule of schedules
      ) {
        if (
          !schedule ||
          !schedule.media
        ) {
          continue;
        }

        if (
          !isCatalogAnime(
            schedule.media,
          )
        ) {
          continue;
        }

        items.push(
          schedule,
        );
      }

      hasNextPage =
        pageData?.pageInfo
          ?.hasNextPage === true;

      page += 1;
    }

    const uniqueItems =
      Array.from(
        new Map(
          items.map(
            (item) => [
              item.id,
              item,
            ],
          ),
        ).values(),
      ).sort(
        (a, b) =>
          a.airingAt -
          b.airingAt,
      );

    const malIds =
      uniqueItems
        .map(
          (item) =>
            item.media?.idMal,
        )
        .filter(
          (
            id,
          ): id is number =>
            typeof id ===
              'number' &&
            id > 0,
        );

    const russianTitles =
      await getRussianTitles(
        malIds,
      );

    return NextResponse.json(
      {
        generatedAt:
          now,

        range: {
          from,
          to,
        },

        count:
          uniqueItems.length,

        items:
          uniqueItems.map(
            (item) => {
              const media =
                item.media!;

              const russian =
                typeof media.idMal ===
                  'number'
                  ? russianTitles.get(
                      media.idMal,
                    ) ?? null
                  : null;

              return {
                id:
                  item.id,

                airingAt:
                  item.airingAt,

                episode:
                  item.episode,

                media: {
                  slug: registerAnime({ id: media.id, title: media.title || {} }).slug,
                  id:
                    media.id,

                  idMal:
                    media.idMal ??
                    null,

                  format:
                    media.format ??
                    null,

                  status:
                    media.status ??
                    null,

                  title: {
                    russian,

                    romaji:
                      media.title
                        ?.romaji ??
                      null,

                    english:
                      media.title
                        ?.english ??
                      null,

                    native:
                      media.title
                        ?.native ??
                      null,
                  },

                  coverImage: {
                    extraLarge:
                      media
                        .coverImage
                        ?.extraLarge ??
                      null,

                    large:
                      media
                        .coverImage
                        ?.large ??
                      null,

                    medium:
                      media
                        .coverImage
                        ?.medium ??
                      null,

                    color:
                      media
                        .coverImage
                        ?.color ??
                      null,
                  },

                  bannerImage:
                    media
                      .bannerImage ??
                    null,
                },
              };
            },
          ),
      },
      {
        headers: publicApiCacheHeaders({
          browserSeconds: 30,
          edgeSeconds: 300,
          staleWhileRevalidateSeconds: 900,
        }),
      },
    );
  } catch (error) {
    console.error(
      'Schedule API error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось загрузить расписание',
      },
      {
        status: 502,
        headers: privateNoStoreHeaders(),
      },
    );
  }
}