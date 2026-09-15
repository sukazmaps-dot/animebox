import { NextRequest, NextResponse } from 'next/server';

const JIKAN_API = 'https://api.jikan.moe/v4/anime';

// Локальный in-memory кэш в памяти Node.js
const memoryCache = new Map<string, { original: string; preview: string }>();

export async function GET(request: NextRequest) {
  try {
    const malId = request.nextUrl.searchParams.get('malId');

    if (!malId || !/^\d+$/.test(malId)) {
      return NextResponse.json(
        { error: 'Некорректный MAL ID' },
        { status: 400 },
      );
    }

    // 1. Быстрая отдача из оперативной памяти сервера (если уже запрашивали)
    if (memoryCache.has(malId)) {
      return NextResponse.json(memoryCache.get(malId), {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      });
    }

    // 2. Используем базовую ручку /v4/anime/${malId} вместо /full
    // Это уменьшает размер ответа в 10 раз (с ~50 КБ до ~3 КБ) и ускоряет ответ
    const response = await fetch(`${JIKAN_API}/${malId}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AnimeTracker/1.0',
      },
      // Увеличиваем кэш Next.js до 24 часов (86400 сек), так как обложки аниме не меняются
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`Jikan Rate Limit hit for malId: ${malId}`);
      }
      return NextResponse.json(
        { error: 'Jikan API error', status: response.status },
        { status: response.status },
      );
    }

    const data = await response.json();
    const image = data?.data?.images?.webp ?? data?.data?.images?.jpg ?? null;

    if (!image) {
      return NextResponse.json(
        { error: 'У аниме нет изображения' },
        { status: 404 },
      );
    }

    const resultData = {
      original: image.large_image_url || image.image_url || '',
      preview: image.image_url || image.small_image_url || '',
    };

    // Сохраняем результат в память сервера
    memoryCache.set(malId, resultData);

    return NextResponse.json(resultData, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('Jikan proxy error:', error);

    return NextResponse.json(
      { error: 'Не удалось связаться с Jikan' },
      { status: 500 },
    );
  }
}