import { readEffectiveAdSettings } from '@/lib/ad-settings-server';
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
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
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
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
