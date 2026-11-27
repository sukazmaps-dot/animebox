import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { getAniListByMalId } from '@/lib/anilist';
import { privateNoStoreHeaders, publicApiCacheHeaders } from '@/lib/edge-cache-policy';

export async function GET(request: NextRequest) {
  try {
    const malIdRaw =
      request.nextUrl.searchParams.get('malId');

    const malId =
      Number.parseInt(malIdRaw ?? '', 10);

    if (!Number.isInteger(malId) || malId <= 0) {
      return NextResponse.json(
        {
          error: 'Invalid malId',
        },
        {
          status: 400,
          headers: privateNoStoreHeaders(),
        },
      );
    }

    const media =
      await getAniListByMalId(malId);

    if (!media) {
      return NextResponse.json(
        {
          error: 'AniList request failed',
        },
        {
          status: 502,
          headers: privateNoStoreHeaders(),
        },
      );
    }

    return NextResponse.json(
      {
        idMal:
          media.idMal ?? malId,

        extraLarge:
          media.coverImage?.extraLarge ??
          null,

        large:
          media.coverImage?.large ??
          null,

        color:
          media.coverImage?.color ??
          null,

        bannerImage:
          media.bannerImage ?? null,
      },
      {
        headers: publicApiCacheHeaders({
          browserSeconds: 60,
          edgeSeconds: 900,
          staleWhileRevalidateSeconds: 3600,
        }),
      },
    );
  } catch (error) {
    console.error(
      'AniList API error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      {
        status: 500,
        headers: privateNoStoreHeaders(),
      },
    );
  }
}
