import 'server-only';
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Недопустимый источник запроса.');
  const raw = await request.text();
  if (raw.length > 20000) throw new ApiError(413, 'Запрос слишком большой.');
  try {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new ApiError(400, 'Некорректный JSON.'); }
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
// Only server-fetched catalog metadata can affect achievement conditions.
export async function ensureAnime(id: number) {
  const admin = adminClient();
  const { data, error } = await admin.from('anime_catalog').select('updated_at,genres').eq('id', id).maybeSingle();
  if (error) throw error;
  if (data && Date.now() - Date.parse(data.updated_at) < 86400000) return;
  const anime = await getAnimeByIdWithShikimori(id);
  if (!anime || anime.id !== id) throw new ApiError(404, 'Аниме не найдено.');
  const { error: saveError } = await admin.from('anime_catalog').upsert({
    id, title: getAnimeTitle(anime), total_episodes: anime.episodes && anime.episodes > 0 ? anime.episodes : null,
    finished: ['FINISHED', 'released', 'Вышло'].includes(anime.status ?? ''),
    genres: [...new Set([...(data?.genres ?? []), ...(anime.genres ?? [])])], updated_at: new Date().toISOString(),
  });
  if (saveError) throw saveError;
}
