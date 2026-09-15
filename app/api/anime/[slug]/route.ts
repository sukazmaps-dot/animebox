import { NextResponse } from 'next/server';
import { resolveAnimeRoute } from '@/lib/anime-route';

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
        ? {
            // Browser cache stays short; Vercel can serve the public catalog
            // from its CDN for longer and revalidate stale entries safely.
            'Cache-Control': 'public, max-age=60',
            'Vercel-CDN-Cache-Control': 'public, max-age=1800, stale-while-revalidate=21600',
          }
        : { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Каталог временно недоступен' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
