import { NextRequest, NextResponse } from 'next/server';

type KodikApiResult = {
  id?: string;
  link?: string;
  translation?: {
    id?: number;
    title?: string;
    type?: string;
  };
};

type KodikApiResponse = {
  results?: KodikApiResult[];
};

function normalizePlayerUrl(url: string) {
  return url.startsWith('//') ? `https:${url}` : url;
}

export async function GET(request: NextRequest) {
  const shikimoriId = request.nextUrl.searchParams.get('shikimoriId');
  const token = process.env.KODIK_TOKEN;

  if (!shikimoriId || !/^\d+$/.test(shikimoriId)) {
    return NextResponse.json(
      { error: 'Missing or invalid shikimoriId' },
      { status: 400 },
    );
  }

  if (!token) {
    console.error('[Kodik] KODIK_TOKEN is not configured');

    return NextResponse.json(
      { error: 'Kodik is not configured' },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    token,
    shikimori_id: shikimoriId,
    limit: '50',
  });

  try {
    const response = await fetch(
      `https://kodik-api.com/search?${params.toString()}`,
      {
        next: {
          revalidate: 60 * 30,
        },
      },
    );

    if (!response.ok) {
      console.error(
        '[Kodik] search failed:',
        response.status,
        response.statusText,
      );

      return NextResponse.json(
        { error: 'Kodik API error' },
        { status: 502 },
      );
    }

    const data = (await response.json()) as KodikApiResponse;
    const seen = new Set<string>();

    const translations = (data.results ?? [])
      .filter(
        (item): item is KodikApiResult & { link: string } =>
          typeof item.link === 'string' && item.link.trim().length > 0,
      )
      .map((item) => ({
        title: item.translation?.title?.trim() || 'Озвучка',
        url: normalizePlayerUrl(item.link.trim()),
        type: 'kodik' as const,
        translationId: item.translation?.id ?? null,
      }))
      .filter((item) => {
        const key = item.translationId
          ? `id:${item.translationId}`
          : `title:${item.title.toLowerCase()}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return NextResponse.json({
      name: 'Kodik',
      translations,
    });
  } catch (error) {
    console.error('[Kodik] request failed:', error);

    return NextResponse.json(
      { error: 'Failed to fetch Kodik' },
      { status: 502 },
    );
  }
}
