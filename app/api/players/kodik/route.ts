import { NextRequest, NextResponse } from 'next/server';

const KODIK_TOKEN = process.env.KODIK_API_TOKEN;

export async function GET(request: NextRequest) {
  const shikimoriId = request.nextUrl.searchParams.get('shikimoriId');

  if (!shikimoriId) {
    return NextResponse.json({ error: 'Missing shikimoriId' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://kodikapi.com/search?token=${KODIK_TOKEN}&shikimori_id=${shikimoriId}&types=anime-serial,anime`
    );
    
    if (!res.ok) throw new Error('Kodik API error');
    
    const data = await res.json();

    // Превращаем результаты Kodik в удобный формат озвучек
    const translations = data.results?.map((item: any) => ({
      title: item.translation?.title || 'Озвучка',
      url: item.link, // Ссылка вроде "//kodik.info/serial/..."
    })) || [];

    return NextResponse.json({ name: 'Kodik', translations });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch Kodik' }, { status: 500 });
  }
}