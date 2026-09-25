import 'server-only';
import { optionalServerSecret } from '@/lib/env/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getAnimeByIdWithShikimori } from '@/lib/combined-anime';
import { getAnimeTitle } from '@/lib/anime-display';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
    throw new ApiError(400, 'Некорректный идентификатор или номер серии.');
  }
  return value;
}
export function adminClient() {
  const key = optionalServerSecret('SUPABASE_SERVICE_ROLE_KEY');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new ApiError(503, 'На сервере не настроен Supabase service role.');
  return createAdmin(url, key, { auth: { persistSession: false } });
}

export async function userClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Войди в аккаунт.');
  return { client, user: data.user };
}
const UNSAFE_BROWSER_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function assertBrowserMutationRequest(request: Request) {
  if (!UNSAFE_BROWSER_METHODS.has(request.method.toUpperCase())) return;

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');

  if (origin && origin !== requestOrigin) {
    throw new ApiError(403, 'Недопустимый источник запроса.');
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'Cross-site запрос отклонён.');
  }

  if (request.headers.get('sec-fetch-mode') === 'navigate') {
    throw new ApiError(403, 'Навигационный запрос к API отклонён.');
  }
}

export async function readJsonBody(
  request: Request,
  options: { maxBytes?: number; requireContentType?: boolean } = {},
): Promise<Record<string, unknown>> {
  assertBrowserMutationRequest(request);

  const maxBytes = options.maxBytes ?? 20_000;
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (
    options.requireContentType !== false &&
    contentType !== 'application/json' &&
    !(contentType?.startsWith('application/') && contentType.endsWith('+json'))
  ) {
    throw new ApiError(415, 'API принимает только JSON.');
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes) {
      throw new ApiError(413, 'Запрос слишком большой.');
    }
  }

  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;

  if (byteLength > maxBytes) {
    throw new ApiError(413, 'Запрос слишком большой.');
  }

  try {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'Некорректный JSON.');
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  return readJsonBody(request, { requireContentType: false });
}
export function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return response({ error: error.message }, error.status);
  const code = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  if (code.includes('RATE_LIMIT')) return response({ error: 'Подожди 10 секунд перед следующим комментарием.' }, 429);
  if (code.includes('NOT_OWNER')) return response({ error: 'Можно удалить только свой комментарий.' }, 403);
  if (/INVALID_|MAX_DEPTH|ANIME_NOT_FOUND/.test(code)) return response({ error: 'Некорректные данные или превышена глубина ответов (8).' }, 400);
  console.error('Community API:', error);
  return response({ error: 'Не удалось сохранить или загрузить данные. Проверь миграцию и настройки сервера.' }, 503);
}
type AnimeCatalogMetadata = {
  id: number;
  title: string;
  total_episodes: number | null;
  finished: boolean;
  genres: string[];
  poster_url: string | null;
  slug: string | null;
  updated_at: string;
};

const ANIME_CATALOG_READ_TTL_MS = 60_000;
const ANIME_CATALOG_READ_CACHE_LIMIT = 2_000;

type AnimeCatalogCacheEntry = {
  row: AnimeCatalogMetadata;
  expiresAt: number;
};

const animeCatalogReadCache = new Map<number, AnimeCatalogCacheEntry>();
const animeCatalogReadInFlight = new Map<
  string,
  Promise<AnimeCatalogMetadata[]>
>();

function rememberAnimeCatalogRow(row: AnimeCatalogMetadata) {
  const animeId = Number(row.id);
  if (!Number.isSafeInteger(animeId) || animeId <= 0) return;

  animeCatalogReadCache.delete(animeId);
  animeCatalogReadCache.set(animeId, {
    row,
    expiresAt: Date.now() + ANIME_CATALOG_READ_TTL_MS,
  });

  while (animeCatalogReadCache.size > ANIME_CATALOG_READ_CACHE_LIMIT) {
    const oldest = animeCatalogReadCache.keys().next().value as
      | number
      | undefined;
    if (oldest == null) break;
    animeCatalogReadCache.delete(oldest);
  }
}

function cachedAnimeCatalogRow(
  animeId: number,
  now: number,
): AnimeCatalogMetadata | null {
  const cached = animeCatalogReadCache.get(animeId);
  if (!cached) return null;

  if (cached.expiresAt <= now) {
    animeCatalogReadCache.delete(animeId);
    return null;
  }

  animeCatalogReadCache.delete(animeId);
  animeCatalogReadCache.set(animeId, cached);
  return cached.row;
}

async function readAnimeCatalogRows(ids: number[]) {
  if (!ids.length) return [] as AnimeCatalogMetadata[];

  const sorted = [...ids].sort((a, b) => a - b);
  const batchKey = sorted.join(',');
  const existingRequest = animeCatalogReadInFlight.get(batchKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const { data, error } = await adminClient()
      .from('anime_catalog')
      .select(
        'id,title,total_episodes,finished,genres,poster_url,slug,updated_at',
      )
      .in('id', sorted);

    if (error) throw error;

    const rows = (data ?? []) as AnimeCatalogMetadata[];
    rows.forEach(rememberAnimeCatalogRow);
    return rows;
  })().finally(() => {
    animeCatalogReadInFlight.delete(batchKey);
  });

  animeCatalogReadInFlight.set(batchKey, request);
  return request;
}

function animePosterUrl(anime: Awaited<ReturnType<typeof getAnimeByIdWithShikimori>>) {
  if (!anime) return null;

  return (
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    anime.image?.original ||
    anime.image?.large ||
    anime.image?.medium ||
    anime.image?.preview ||
    null
  );
}

function animeCatalogPayload(
  anime: NonNullable<Awaited<ReturnType<typeof getAnimeByIdWithShikimori>>>,
  previousGenres: string[] = [],
) {
  return {
    id: anime.id,
    title: getAnimeTitle(anime),
    total_episodes:
      anime.episodes && anime.episodes > 0
        ? anime.episodes
        : null,
    finished: ['FINISHED', 'released', 'Вышло'].includes(
      anime.status ?? '',
    ),
    genres: [
      ...new Set([
        ...previousGenres,
        ...(anime.genres ?? []),
      ]),
    ],
    poster_url: animePosterUrl(anime),
    slug:
      typeof anime.slug === 'string' && anime.slug.trim()
        ? anime.slug.trim()
        : null,
    updated_at: new Date().toISOString(),
  };
}

// Only server-fetched catalog metadata can affect achievement conditions.
export async function ensureAnimes(ids: number[]) {
  const uniqueIds = [...new Set(ids)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );

  if (!uniqueIds.length) return [] as AnimeCatalogMetadata[];

  const admin = adminClient();
  const now = Date.now();
  const existing = new Map<number, AnimeCatalogMetadata>();
  const misses: number[] = [];

  for (const animeId of uniqueIds) {
    const cached = cachedAnimeCatalogRow(animeId, now);
    if (cached) {
      existing.set(animeId, cached);
    } else {
      misses.push(animeId);
    }
  }

  if (misses.length) {
    const rows = await readAnimeCatalogRows(misses);
    for (const row of rows) {
      existing.set(Number(row.id), row);
    }
  }


  const refreshIds = uniqueIds.filter((id) => {
    const row = existing.get(id);
    return !row || now - Date.parse(row.updated_at) >= 86_400_000;
  });

  if (refreshIds.length) {
    const fetched = await Promise.all(
      refreshIds.map(async (id) => {
        const anime = await getAnimeByIdWithShikimori(id);
        if (!anime || anime.id !== id) {
          throw new ApiError(404, 'Аниме не найдено.');
        }

        return animeCatalogPayload(
          anime,
          Array.isArray(existing.get(id)?.genres)
            ? existing.get(id)!.genres
            : [],
        );
      }),
    );

    const { data: saved, error: saveError } = await admin
      .from('anime_catalog')
      .upsert(fetched)
      .select(
        'id,title,total_episodes,finished,genres,poster_url,slug,updated_at',
      );

    if (saveError) throw saveError;

    for (const row of (saved ?? []) as AnimeCatalogMetadata[]) {
      existing.set(Number(row.id), row);
      rememberAnimeCatalogRow(row);
    }
  }

  return uniqueIds.flatMap((id) => {
    const row = existing.get(id);
    return row ? [row] : [];
  });
}

export async function ensureAnime(id: number) {
  const [anime] = await ensureAnimes([id]);

  if (!anime) {
    throw new ApiError(404, 'Аниме не найдено.');
  }

  return anime;
}

export async function ensureAnimeArtwork(id: number) {
  const admin = adminClient();
  const cached = cachedAnimeCatalogRow(id, Date.now());

  if (cached?.slug) {
    return cached;
  }

  const { data, error } = cached
    ? { data: cached, error: null }
    : await admin
        .from('anime_catalog')
        .select(
          'id,title,total_episodes,finished,genres,poster_url,slug,updated_at',
        )
        .eq('id', id)
        .maybeSingle();

  if (error) throw error;
  if (data) rememberAnimeCatalogRow(data as AnimeCatalogMetadata);

  // slug doubles as an "artwork metadata was checked" marker. This avoids
  // hammering AniList/Shikimori for titles that genuinely have no poster.
  if (data?.slug) {
    return data as AnimeCatalogMetadata;
  }

  const anime = await getAnimeByIdWithShikimori(id);
  if (!anime || anime.id !== id) {
    throw new ApiError(404, 'Аниме не найдено.');
  }

  const { data: saved, error: saveError } = await admin
    .from('anime_catalog')
    .upsert(
      animeCatalogPayload(
        anime,
        Array.isArray(data?.genres) ? data.genres : [],
      ),
    )
    .select(
      'id,title,total_episodes,finished,genres,poster_url,slug,updated_at',
    )
    .single();

  if (saveError) throw saveError;
  rememberAnimeCatalogRow(saved as AnimeCatalogMetadata);
  return saved as AnimeCatalogMetadata;
}
