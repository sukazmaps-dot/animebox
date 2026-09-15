import { NextResponse } from 'next/server';
import { resolveAnimeRoute } from '@/lib/anime-route';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const anime = await resolveAnimeRoute(slug);
    return NextResponse.json(anime ? { anime } : { error: 'Аниме не найдено' }, {
      status: anime ? 200 : 404,
      headers: { 'Cache-Control': anime ? 'private, max-age=60' : 'no-store' },
    });
  } catch { return NextResponse.json({ error: 'Каталог временно недоступен' }, { status: 503 }); }
}
