import { readEffectiveAdSettings } from '@/lib/ad-settings-server';
import { privateNoStoreHeaders, publicApiCacheHeaders } from '@/lib/edge-cache-policy';
import { AD_PROVIDER } from '@/lib/monetization';

export async function GET() {
  try {
    const { settings } = await readEffectiveAdSettings();

    return Response.json(
      {
        ...settings,
        provider: AD_PROVIDER,
      },
      {
        headers: publicApiCacheHeaders({
          browserSeconds: 10,
          edgeSeconds: 30,
          staleWhileRevalidateSeconds: 60,
        }),
      },
    );
  } catch (error) {
    console.error('[AnimeBox Ads] public config:', error);
    return Response.json(
      {
        enabled: false,
        maxAdsPerSession: 1,
        minSecondsBetweenAds: 300,
        placements: {
          'home-after-smart-feed': false,
          'catalog-after-results': false,
          'anime-detail-before-related': false,
          'watch-below-engagement': false,
        },
        provider: AD_PROVIDER,
      },
      { status: 200, headers: privateNoStoreHeaders() },
    );
  }
}
