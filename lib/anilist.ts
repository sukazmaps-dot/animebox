import { isCatalogAnime } from '@/lib/catalog-filter';
import type { Anime } from '@/types/anime';
import { fetchWithRetry } from '@/lib/fetch-retry';

const ANILIST_API_URL = 'https://graphql.anilist.co';

// --- ЛОКАЛИЗАЦИЯ И ОЧИСТКА ---

export function cleanDescription(
  html?: string | null,
): string {
  if (!html) {
    return '';
  }

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /\[\/?(b|i|u|s|spoiler|quote)\]/gi,
      '',
    )
    .trim();
}

const FORMAT_MAP: Record<string, string> = {
  TV: 'ТВ',
  TV_SHORT: 'ТВ (Короткое)',
  MOVIE: 'Фильм',
  SPECIAL: 'Спешл',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Клип',
};

const STATUS_MAP: Record<string, string> = {
  FINISHED: 'Вышло',
  RELEASING: 'Онгоинг',
  NOT_YET_RELEASED: 'Анонс',
  CANCELLED: 'Отменено',
  HIATUS: 'Пауза',
};

const GENRE_MAP: Record<string, string> = {
  Action: 'Экшен',
  Adventure: 'Приключения',
  Comedy: 'Комедия',
  Drama: 'Драма',
  Ecchi: 'Эччи',
  Fantasy: 'Фэнтези',
  Horror: 'Ужасы',
  MahouShoujo: 'Махо-сёдзё',
  Mecha: 'Меха',
  Music: 'Музыка',
  Mystery: 'Детектив',
  Psychological: 'Психологическое',
  Romance: 'Романтика',
  'Sci-Fi': 'Фантастика',
  'Slice of Life': 'Повседневность',
  Sports: 'Спорт',
  Supernatural: 'Сверхъестественное',
  Thriller: 'Триллер',
};

export function translateFormat(
  format?: string | null,
): string | null {
  if (!format) {
    return null;
  }

  return FORMAT_MAP[format] || format;
}

export function translateStatus(
  status?: string | null,
): string | null {
  if (!status) {
    return null;
  }

  return STATUS_MAP[status] || status;
}

export function translateGenre(
  genre: string,
): string {
  return GENRE_MAP[genre] || genre;
}

// --- ТИПЫ И ЗАПРОСЫ ---

export type AniListListOrder =
  | 'ranked'
  | 'popularity';

export type GetAnimesOptions = {
  limit?: number;
  page?: number;
  order?: AniListListOrder;
  status?: 'ongoing' | 'finished' | 'upcoming';
  search?: string;
  genre?: number | string;
  genres?: Array<number | string>;
  year?: number;
  format?: 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL';
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
};

// AniList response is normalized by mapMediaToAnime below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AniListMedia = any;

type AniListPageResponse = {
  data?: {
    Page?: {
      media?: AniListMedia[];
    };
  };

  errors?: Array<{
    message?: string;
  }>;
};

const LIST_QUERY = `
  query AnimeList(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $status: MediaStatus
    $search: String
    $genres: [String]
    $formats: [MediaFormat]
    $season: MediaSeason
    $seasonYear: Int
  ) {
    Page(
      page: $page
      perPage: $perPage
    ) {
      media(
        type: ANIME
        format_in: $formats
        countryOfOrigin: JP
        isAdult: false
        sort: $sort
        status: $status
        search: $search
        genre_in: $genres
        season: $season
        seasonYear: $seasonYear
      ) {
        id
        type
        isAdult
        countryOfOrigin
        tags { name }
        idMal
        title {
          romaji
          english
          native
        }
        synonyms
        averageScore
        episodes
        nextAiringEpisode { episode }
        status
        format
        genres
        startDate {
          year
          month
          day
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
`;

function mapMediaToAnime(
  media: AniListMedia & {
    description?: string | null;
    averageScore?: number | null;
    episodes?: number | null;
    nextAiringEpisode?: { episode?: number | null } | null;
    duration?: number | null;
    status?: string | null;
    format?: string | null;
    genres?: string[];

    studios?: {
      nodes?: Array<{
        name?: string | null;
      }>;
    };

    startDate?: {
      year?: number | null;
      month?: number | null;
      day?: number | null;
    } | null;

    endDate?: {
      year?: number | null;
      month?: number | null;
      day?: number | null;
    } | null;
  },
): Anime {
  return {
    id: media.id,
    catalogEligible: isCatalogAnime(media),

    idMal:
      media.idMal ?? null,

    mal_id:
      media.idMal ?? null,

    title: {
      romaji:
        media.title?.romaji ??
        media.title?.english ??
        null,

      english:
        media.title?.english ??
        media.title?.romaji ??
        null,

      native:
        media.title?.native ??
        null,

      russian: null,
    },

    synonyms:
      Array.isArray(media.synonyms)
        ? media.synonyms
            .filter((value: unknown): value is string =>
              typeof value === 'string' && Boolean(value.trim()),
            )
            .map((value: string) => value.trim())
        : [],

    description:
      cleanDescription(
        media.description,
      ),

    score:
      media.averageScore != null
        ? media.averageScore / 10
        : null,

    episodes:
      media.episodes ?? null,
    episodesAired: media.nextAiringEpisode?.episode ? Math.max(0, media.nextAiringEpisode.episode - 1) : null,

    duration:
      media.duration ?? null,

    status:
      translateStatus(
        media.status,
      ),

    format:
      translateFormat(
        media.format,
      ),

    genres:
      (media.genres ?? []).map(
        translateGenre,
      ),

    // Keep lightweight AniList tags for Smart Discovery constraints such as
    // "без гарема". They are public catalogue metadata and remain optional
    // for every existing consumer of Anime.
    tags: Array.isArray(media.tags)
      ? media.tags
          .map((tag: { name?: string | null } | null) => tag?.name?.trim() ?? '')
          .filter(Boolean)
          .slice(0, 40)
      : [],

    studios:
      media.studios?.nodes
        ?.filter(
          (
            studio: {
              name?: string | null;
            },
          ): studio is {
            name: string;
          } =>
            typeof studio.name ===
            'string',
        )
        .map(
          (studio: {
            name: string;
          }) => ({
            name: studio.name,
          }),
        ) ?? [],

    startDate:
      media.startDate
        ? {
            year:
              media.startDate
                .year ?? null,

            month:
              media.startDate
                .month ?? null,

            day:
              media.startDate
                .day ?? null,
          }
        : null,

    endDate:
      media.endDate
        ? {
            year:
              media.endDate
                .year ?? null,

            month:
              media.endDate
                .month ?? null,

            day:
              media.endDate
                .day ?? null,
          }
        : null,

    coverImage: {
      extraLarge:
        media.coverImage
          ?.extraLarge ?? null,

      large:
        media.coverImage
          ?.large ?? null,

      medium:
        media.coverImage
          ?.large ??
        media.coverImage
          ?.extraLarge ??
        null,

      color:
        media.coverImage
          ?.color ?? null,
    },

    bannerImage:
      media.bannerImage ??
      null,
  };
}

export async function getAnimes(
  options: GetAnimesOptions = {},
  fetchOptions?: {
    signal?: AbortSignal;
  },
): Promise<Anime[]> {
  const {
    limit = 20,
    page = 1,
    order = 'ranked',
    status,
    search,
    genre,
    genres,
    year,
    format,
    season,
  } = options;

  const sort =
    search?.trim() ? ['SEARCH_MATCH'] : order === 'popularity'
      ? ['POPULARITY_DESC']
      : ['SCORE_DESC'];

  try {
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

          body: JSON.stringify({
            query: LIST_QUERY,

            variables: {
              page,

              perPage:
                Math.min(
                  Math.max(
                    limit,
                    1,
                  ),
                  50,
                ),

              sort,

              status:
                status === 'ongoing'
                  ? 'RELEASING'
                  : status === 'finished'
                    ? 'FINISHED'
                    : status === 'upcoming'
                      ? 'NOT_YET_RELEASED'
                      : undefined,

              search:
                search?.trim() ||
                undefined,

              genres: (() => {
                const map = ({ '1': 'Action', '2': 'Adventure', '4': 'Comedy', '8': 'Drama', '10': 'Fantasy', '14': 'Horror', '22': 'Romance', '24': 'Sci-Fi', '7': 'Mystery', '36': 'Slice of Life', '30': 'Sports', '37': 'Supernatural' } as Record<string, string>);
                const values = genres?.length
                  ? genres
                  : genre != null
                    ? [genre]
                    : [];
                const normalized = values
                  .map((value) => map[String(value)] || String(value))
                  .filter(Boolean);
                return normalized.length > 0 ? normalized : undefined;
              })(),

              formats: format
                ? [format]
                : ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'],

              season: season || undefined,

              seasonYear:
                Number.isSafeInteger(year) && Number(year) >= 1940
                  ? Number(year)
                  : undefined,
            },
          }),

          signal:
            fetchOptions?.signal,

          next: {
            revalidate: 900,
          },
        },
      );

    if (!response.ok) {
      throw new Error(
        `AniList HTTP ${response.status}`,
      );
    }

    const json =
      (await response.json()) as
        AniListPageResponse;

    if (json.errors?.length) {
      throw new Error(
        json.errors[0]
          ?.message ??
          'AniList GraphQL error',
      );
    }

    /*
     * Keep the broad eligibility filters inside AniList itself. Previously we
     * requested exactly 16 mixed-origin rows and only then removed non-JP /
     * adult entries locally. A page could therefore collapse to 4–6 cards and
     * look like the catalog had ended. The local predicate remains as the
     * final safety net for rare excluded tags.
     */
    const anilistAnimes =
      json.data?.Page?.media?.filter(isCatalogAnime).map(
        (media) =>
          mapMediaToAnime(
            media as Parameters<
              typeof mapMediaToAnime
            >[0],
          ),
      ) ?? [];

    if (
      anilistAnimes.length ===
      0
    ) {
      return [];
    }

    return anilistAnimes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw error;
    }

console.error(
  `ANILIST_ERROR ${
    error instanceof Error
      ? error.message
      : String(error)
  }`,
);

    throw error;
  }
}

export async function getAnimesByMalIds(
  malIds: number[],
  fetchOptions?: {
    signal?: AbortSignal;
  },
): Promise<Anime[]> {
  const ids =
    Array.from(
      new Set(
        malIds.filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0,
        ),
      ),
    ).slice(0, 30);

  if (ids.length === 0) {
    return [];
  }

  // Page skips missing MAL IDs without failing independent Media aliases.
  const fields = LIST_QUERY.slice(LIST_QUERY.indexOf('        id'), LIST_QUERY.lastIndexOf('      }'));
  const query = `query AnimeByMalIds($ids: [Int], $limit: Int) {
    Page(page: 1, perPage: $limit) {
      media(type: ANIME, idMal_in: $ids) { ${fields} }
    }
  }`;

  try {
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
              query,
              variables: { ids, limit: ids.length },
            }),

          signal:
            fetchOptions?.signal,

          next: {
            revalidate: 900,
          },
        },
      );

    if (!response.ok) {
      throw new Error(
        `AniList HTTP ${response.status}`,
      );
    }

    const json = (await response.json()) as AniListPageResponse;
    if (json.errors?.length) throw new Error(json.errors[0]?.message || 'AniList MAL lookup failed');
    if (!Array.isArray(json.data?.Page?.media)) throw new Error('Invalid AniList MAL response');
    const media = json.data.Page.media.filter(Boolean);

    const mapped =
      media.map((item) =>
        mapMediaToAnime(
          item as Parameters<
            typeof mapMediaToAnime
          >[0],
        ),
      );

    const byMalId =
      new Map(
        mapped
          .filter(
            (anime) =>
              typeof anime.idMal ===
              'number',
          )
          .map((anime) => [
            anime.idMal as number,
            anime,
          ]),
      );

    return ids
      .map((id) =>
        byMalId.get(id),
      )
      .filter(
        (
          anime,
        ): anime is Anime =>
          Boolean(anime),
      );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw error;
    }

    console.error(
      'AniList MAL batch request failed:',
      error,
    );

    throw error;
  }
}

const SINGLE_QUERY = `
  query AnimeByMalId($idMal: Int) {
    Media(
      idMal: $idMal
      type: ANIME
    ) {
      id
      idMal
      countryOfOrigin
      title {
        romaji
        english
        native
      }
      synonyms
      coverImage {
        extraLarge
        large
        color
      }
      bannerImage
    }
  }
`;

type AniListSingleResponse = {
  data?: {
    Media?: AniListMedia | null;
  };

  errors?: Array<{
    message?: string;
  }>;
};

export async function getAniListByMalId(
  malId: number | string,
): Promise<AniListMedia | null> {
  const parsedMalId =
    Number(malId);

  if (
    isNaN(parsedMalId) ||
    parsedMalId <= 0
  ) {
    return null;
  }

  try {
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
                SINGLE_QUERY,

              variables: {
                idMal:
                  parsedMalId,
              },
            }),

          next: {
            revalidate: 900,
          },
        },
      );

    if (!response.ok) {
      return null;
    }

    const json =
      (await response.json()) as
        AniListSingleResponse;

    if (
      json.errors?.length
    ) {
      return null;
    }

    return (
      json.data?.Media ??
      null
    );
  } catch (error) {
    console.error(
      'AniList request failed:',
      error,
    );

    return null;
  }
}

const BY_ID_QUERY = `
  query AnimeById($id: Int) {
    Media(
      id: $id
      type: ANIME
    ) {
      id
      type
      isAdult
      countryOfOrigin
      tags {
        name
      }
      idMal
      title {
        romaji
        english
        native
      }
      synonyms
      description(asHtml: false)
      averageScore
      episodes
      nextAiringEpisode { episode }
      duration
      status
      format
      genres
      studios {
        nodes {
          name
        }
      }
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
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
`;

type AniListByIdResponse = {
  data?: {
    Media?: unknown;
  };

  errors?: Array<{
    message?: string;
  }>;
};

export async function getAnimeById(
  id: number | string,
  options?: {
    throwOnError?: boolean;
  },
): Promise<Anime | null> {
  const animeId =
    Number(id);

  if (
    isNaN(animeId) ||
    animeId <= 0
  ) {
    return null;
  }

  try {
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
                BY_ID_QUERY,

              variables: {
                id:
                  animeId,
              },
            }),

          next: {
            revalidate: 900,
          },
        },
      );

    if (!response.ok) {
      throw new Error(
        `AniList HTTP ${response.status}`,
      );
    }

    const json =
      (await response.json()) as
        AniListByIdResponse;

    if (
      json.errors?.length
    ) {
      throw new Error(
        json.errors[0]
          ?.message ??
          'AniList GraphQL error',
      );
    }

    if (
      !json.data?.Media
    ) {
      return null;
    }

    const mapped = mapMediaToAnime(
      json.data
        .Media as Parameters<
        typeof mapMediaToAnime
      >[0],
    );

    return mapped.catalogEligible === false ? null : mapped;
  } catch (error) {
    console.error(
      'AniList by ID request failed:',
      error,
    );

    if (options?.throwOnError) {
      throw error;
    }

    return null;
  }
}

export async function getAniListById(
  id: number,
) {
  const query = BY_ID_QUERY;


  try {
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
              query,

              variables: {
                id,
              },
            }),

          next: {
            revalidate: 900,
          },
        },
      );

    if (!response.ok) {
      return null;
    }

    const json =
      await response.json();

    return (
      json.data?.Media ??
      null
    );
  } catch (error) {
    console.error(
      'Ошибка getAniListById:',
      error,
    );

    return null;
  }
}

// --- ФРАНШИЗЫ И СВЯЗИ ---

export type AniListRelationType =
  | 'ADAPTATION'
  | 'PREQUEL'
  | 'SEQUEL'
  | 'PARENT'
  | 'SIDE_STORY'
  | 'CHARACTER'
  | 'SUMMARY'
  | 'ALTERNATIVE'
  | 'SPIN_OFF'
  | 'OTHER'
  | 'SOURCE'
  | 'COMPILATION'
  | 'CONTAINS'
  | 'SAME_UNIVERSE';

export type AniListFranchiseDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type AniListFranchiseTitle = {
  romaji: string | null;
  english: string | null;
  native: string | null;
};

export type AniListFranchiseCoverImage = {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
};

export type AniListFranchiseMedia = {
  id: number;
  idMal: number | null;

  type:
    | 'ANIME'
    | 'MANGA'
    | null;

  format:
    | string
    | null;

  episodes:
    number | null;

  title:
    AniListFranchiseTitle;

  startDate:
    AniListFranchiseDate |
    null;

  coverImage:
    AniListFranchiseCoverImage;

  bannerImage:
    string | null;
};

export type AniListRelationEdge = {
  relationType:
    AniListRelationType;

  node:
    AniListFranchiseMedia;
};

export type AniListRelationsResult =
  AniListFranchiseMedia & {
    relations:
      AniListRelationEdge[];
  };

const FRANCHISE_RELATIONS_QUERY = `
  query AnimeFranchiseRelations(
    $id: Int!
  ) {
    Media(
      id: $id
      type: ANIME
    ) {
      id
      idMal
      type
      format
      episodes

      title {
        romaji
        english
        native
      }

      startDate {
        year
        month
        day
      }

      coverImage {
        extraLarge
        large
        medium
        color
      }

      bannerImage

      relations {
        edges {
          relationType(version: 2)

          node {
            id
            idMal
            type
            format
            episodes

            title {
              romaji
              english
              native
            }

            startDate {
              year
              month
              day
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
  }
`;

type AniListRelationsResponse = {
  data?: {
    Media?: {
      id?: number;
      idMal?: number | null;

      type?:
        | 'ANIME'
        | 'MANGA'
        | null;

      format?:
        | string
        | null;

      episodes?: number | null;

      title?: {
        romaji?: string | null;
        english?: string | null;
        native?: string | null;
      } | null;

      startDate?: {
        year?: number | null;
        month?: number | null;
        day?: number | null;
      } | null;

      coverImage?: {
        extraLarge?: string | null;
        large?: string | null;
        medium?: string | null;
        color?: string | null;
      } | null;

      bannerImage?:
        | string
        | null;

      relations?: {
        edges?: Array<{
          relationType?:
            | string
            | null;

          node?: {
            id?: number;
            idMal?: number | null;

            type?:
              | 'ANIME'
              | 'MANGA'
              | null;

            format?:
              | string
              | null;

            episodes?: number | null;

            title?: {
              romaji?: string | null;
              english?: string | null;
              native?: string | null;
            } | null;

            startDate?: {
              year?: number | null;
              month?: number | null;
              day?: number | null;
            } | null;

            coverImage?: {
              extraLarge?: string | null;
              large?: string | null;
              medium?: string | null;
              color?: string | null;
            } | null;

            bannerImage?:
              | string
              | null;
          } | null;
        } | null> | null;
      } | null;
    } | null;
  };

  errors?: Array<{
    message?: string;
  }>;
};

const KNOWN_RELATION_TYPES =
  new Set<AniListRelationType>([
    'ADAPTATION',
    'PREQUEL',
    'SEQUEL',
    'PARENT',
    'SIDE_STORY',
    'CHARACTER',
    'SUMMARY',
    'ALTERNATIVE',
    'SPIN_OFF',
    'OTHER',
    'SOURCE',
    'COMPILATION',
    'CONTAINS',
    'SAME_UNIVERSE',
  ]);

function normalizeRelationType(
  value?: string | null,
): AniListRelationType {
  if (
    value &&
    KNOWN_RELATION_TYPES.has(
      value as AniListRelationType,
    )
  ) {
    return (
      value as
        AniListRelationType
    );
  }

  return 'OTHER';
}

function mapFranchiseMedia(
  media: {
    id?: number;
    idMal?: number | null;

    type?:
      | 'ANIME'
      | 'MANGA'
      | null;

    format?:
      | string
      | null;

    episodes?: number | null;

    title?: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    } | null;

    startDate?: {
      year?: number | null;
      month?: number | null;
      day?: number | null;
    } | null;

    coverImage?: {
      extraLarge?: string | null;
      large?: string | null;
      medium?: string | null;
      color?: string | null;
    } | null;

    bannerImage?:
      | string
      | null;
  },
): AniListFranchiseMedia | null {
  if (
    typeof media.id !==
      'number' ||
    media.id <= 0
  ) {
    return null;
  }

  return {
    id:
      media.id,

    idMal:
      typeof media.idMal ===
      'number'
        ? media.idMal
        : null,

    type:
      media.type ??
      null,

    format:
      media.format ??
      null,

    episodes:
      typeof media.episodes === 'number' && media.episodes > 0
        ? media.episodes
        : null,

    title: {
      romaji:
        media.title
          ?.romaji ?? null,

      english:
        media.title
          ?.english ?? null,

      native:
        media.title
          ?.native ?? null,
    },

    startDate:
      media.startDate
        ? {
            year:
              media.startDate
                .year ?? null,

            month:
              media.startDate
                .month ?? null,

            day:
              media.startDate
                .day ?? null,
          }
        : null,

    coverImage: {
      extraLarge:
        media.coverImage
          ?.extraLarge ?? null,

      large:
        media.coverImage
          ?.large ?? null,

      medium:
        media.coverImage
          ?.medium ?? null,

      color:
        media.coverImage
          ?.color ?? null,
    },

    bannerImage:
      media.bannerImage ??
      null,
  };
}

export async function getAnimeRelationsById(
  id: number | string,
  fetchOptions?: {
    signal?: AbortSignal;
  },
): Promise<
  AniListRelationsResult |
  null
> {
  const animeId =
    Number(id);

  if (
    !Number.isInteger(
      animeId,
    ) ||
    animeId <= 0
  ) {
    return null;
  }

  try {
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
                FRANCHISE_RELATIONS_QUERY,

              variables: {
                id:
                  animeId,
              },
            }),

          signal:
            fetchOptions?.signal,

          next: {
            revalidate: 3600,
          },
        },
        1,
      );

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('AniList relations rate limited (HTTP 429)');
        return null;
      }

      throw new Error(
        `AniList HTTP ${response.status}`,
      );
    }

    const json =
      (await response.json()) as
        AniListRelationsResponse;

    if (
      json.errors?.length
    ) {
      throw new Error(
        json.errors[0]
          ?.message ??
          'AniList GraphQL error',
      );
    }

    const media =
      json.data?.Media;

    if (!media) {
      return null;
    }

    const root =
      mapFranchiseMedia(
        media,
      );

    if (!root) {
      return null;
    }

    const relations:
      AniListRelationEdge[] =
      [];

    for (
      const edge of
        media.relations
          ?.edges ?? []
    ) {
      if (!edge?.node) {
        continue;
      }

      const node =
        mapFranchiseMedia(
          edge.node,
        );

      if (!node) {
        continue;
      }

      relations.push({
        relationType:
          normalizeRelationType(
            edge.relationType,
          ),

        node,
      });
    }

    return {
      ...root,
      relations,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw error;
    }

    console.warn(
      `AniList relations request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return null;
  }
}

export function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name ===
      'AbortError'
  );
}

const RECOMMENDATIONS_QUERY = `
  query AnimeRecommendations($id: Int!, $perPage: Int!) {
    Media(id: $id, type: ANIME) {
      recommendations(page: 1, perPage: $perPage, sort: RATING_DESC) {
        nodes {
          rating
          mediaRecommendation {
            id
            type
            isAdult
            countryOfOrigin
            tags { name }
            idMal
            title {
              romaji
              english
              native
            }
            synonyms
            averageScore
            episodes
            nextAiringEpisode { episode }
            status
            format
            genres
            startDate {
              year
              month
              day
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
  }
`;

/**
 * AniList's own recommendation graph is the best first candidate source for
 * natural-language requests like "похожее на Фрирен". Failures are soft: the
 * discovery route always has genre/global fallbacks.
 */
export async function getAnimeRecommendationsById(
  id: number,
  limit = 30,
  signal?: AbortSignal,
): Promise<Anime[]> {
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const perPage = Math.min(50, Math.max(5, Math.round(limit)));

  try {
    const response = await fetchWithRetry(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: RECOMMENDATIONS_QUERY,
        variables: { id, perPage },
      }),
      signal,
      next: { revalidate: 3600 },
    });

    if (!response.ok) return [];
    const json = await response.json() as {
      data?: {
        Media?: {
          recommendations?: {
            nodes?: Array<{
              rating?: number | null;
              mediaRecommendation?: AniListMedia | null;
            } | null>;
          } | null;
        } | null;
      };
    };

    return (json.data?.Media?.recommendations?.nodes ?? [])
      .map((node) => node?.mediaRecommendation)
      .filter((media): media is AniListMedia => Boolean(media))
      .map((media) => mapMediaToAnime(media))
      .filter((anime) => anime.catalogEligible !== false);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    console.warn('AniList recommendations request failed:', error);
    return [];
  }
}
