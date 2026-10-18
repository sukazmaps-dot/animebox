import { NextRequest, NextResponse } from 'next/server';
import { createPublicResultCache } from '@/lib/public-result-cache';
import { privateNoStoreHeaders, publicApiCacheHeaders } from '@/lib/edge-cache-policy';

const JIKAN_API = 'https://api.jikan.moe/v4/anime';

type Poster = { original: string; preview: string };
const readPoster = createPublicResultCache<{poster?: Poster; status: number}>({
  ttlMs: 86_400_000, maxEntries: 256, maxBytes: 512 * 1024,
  cacheWhen: result => result.status === 200 && Boolean(result.poster),
});
const headers = publicApiCacheHeaders({browserSeconds: 86400, edgeSeconds: 86400, staleWhileRevalidateSeconds: 604800});

export async function GET(request: NextRequest) {
  try {
    const malId = request.nextUrl.searchParams.get('malId');

    if (!malId || !/^\d{1,10}$/.test(malId) || Number(malId) <= 0) {
      return NextResponse.json(
        { error: 'Некорректный MAL ID' },
        { status: 400, headers: privateNoStoreHeaders() },
      );
    }

    const result = await readPoster(String(Number(malId)), async signal => {
      // 2. Используем базовую ручку /v4/anime/${malId} вместо /full
      // Это уменьшает размер ответа в 10 раз (с ~50 КБ до ~3 КБ) и ускоряет ответ
      const response = await fetch(`${JIKAN_API}/${malId}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AnimeTracker/1.0',
        },
        // Увеличиваем кэш Next.js до 24 часов (86400 сек), так как обложки аниме не меняются
        next: { revalidate: 86400 },
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`Jikan Rate Limit hit for malId: ${malId}`);
        }
        await response.body?.cancel().catch(() => undefined);
        return {status: response.status};
      }

      const data = await response.json();
      const image = data?.data?.images?.webp ?? data?.data?.images?.jpg ?? null;

      if (!image) {
        return {status: 404};
      }

      const resultData = {
        original: image.large_image_url || image.image_url || '',
        preview: image.image_url || image.small_image_url || '',
      };

      if (!resultData.original && !resultData.preview) return {status: 404};
      return {poster: resultData, status: 200};
    }, request.signal);
    if (!result.poster) return NextResponse.json(
      {error: 'Jikan API error', status: result.status},
      {status: result.status, headers: privateNoStoreHeaders()},
    );
    return NextResponse.json(result.poster, {headers});
  } catch (error) {
    console.error('Jikan proxy error:', error);

    return NextResponse.json(
      { error: 'Не удалось связаться с Jikan' },
      { status: 502, headers: privateNoStoreHeaders() },
    );
  }
}