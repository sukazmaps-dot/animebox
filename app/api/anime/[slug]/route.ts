import { NextResponse } from 'next/server';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { privateNoStoreHeaders, publicApiCacheHeaders } from '@/lib/edge-cache-policy';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const anime = await resolveAnimeRoute(slug);

    return NextResponse.json(anime ? { anime } : { error: 'Аниме не найдено' }, {
      status: anime ? 200 : 404,
      headers: anime
        ? publicApiCacheHeaders({
            browserSeconds: 60,
            edgeSeconds: 1800,
            staleWhileRevalidateSeconds: 21600,
          })
        : privateNoStoreHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Каталог временно недоступен' },
      { status: 503, headers: privateNoStoreHeaders() },
    );
  }
}
