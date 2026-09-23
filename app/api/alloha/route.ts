import { NextRequest, NextResponse } from 'next/server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

const ALLOHA_TOKEN = process.env.ALLOHA_API_TOKEN;

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'alloha_lookup_ip', limit: 120, windowSeconds: 60,
  });
  if (limited) return limited;

  const shikimoriId = request.nextUrl.searchParams.get('shikimoriId');

  if (!shikimoriId) {
    return NextResponse.json({ error: 'Missing shikimoriId' }, { status: 400 });
  }

  try {
    // Пример запроса к API Alloha (проверьте актуальную документацию Alloha)
    const res = await fetch(
      `https://api.alloha.tv/?token=${ALLOHA_TOKEN}&shikimori=${shikimoriId}`
    );
    
    if (!res.ok) throw new Error('Alloha API error');
    
    const data = await res.json();

    // Превращаем данные Alloha в аналогичный формат
    // (зависит от того, как именно их API возвращает озвучки)
    const translations = data.data?.translations?.map((item: any) => ({
      title: item.name,
      url: item.iframe_url,
    })) || [];

    return NextResponse.json({ name: 'Alloha', translations });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch Alloha' }, { status: 500 });
  }
}