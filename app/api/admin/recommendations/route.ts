import { requireAdmin } from '@/lib/admin-server';
import { ApiError, failure } from '@/lib/community-server';
import { getRecommendationAnalytics } from '@/lib/recommendation-analytics-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const days = Number(new URL(request.url).searchParams.get('days') || 7);
    if (days !== 7 && days !== 30) {
      return Response.json({ ok: false, error: 'invalid_range' }, { status: 400 });
    }
    const dashboard = await getRecommendationAnalytics(days);
    return Response.json({ ok: true, dashboard }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    console.error('[Admin recommendation analytics]', error);
    return Response.json({ ok: false, error: 'recommendation_analytics_unavailable' }, { status: 500 });
  }
}
