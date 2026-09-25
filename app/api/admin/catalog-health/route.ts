import { getAnimeByIdWithShikimori } from '@/lib/combined-anime';
import {
  getCatalogHealthSnapshot,
  refreshCatalogAvailability,
} from '@/lib/catalog-availability-server';
import {
  requireAdmin,
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import {
  ApiError,
  failure,
  readBody,
} from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const health = await getCatalogHealthSnapshot();

    return Response.json(
      { ok: true, health },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    console.error('[Admin catalog health]', error);
    return Response.json(
      { ok: false, error: 'catalog_health_unavailable' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readBody(request);
    const animeId = Number(body.animeId);

    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      throw new ApiError(400, 'Некорректный animeId.');
    }

    const anime = await getAnimeByIdWithShikimori(animeId);
    if (!anime) throw new ApiError(404, 'Аниме не найдено.');

    const availability = await refreshCatalogAvailability(anime, {
      force: true,
    });

    await writeAdminAudit({
      actorId: actor.user.id,
      actorRole: actor.role,
      action: 'catalog_availability_recheck',
      targetType: 'anime',
      targetId: String(animeId),
      details: {
        availability: availability?.availability_status ?? 'unknown',
      },
      request,
    });

    return Response.json(
      { ok: true, availability },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    console.error('[Admin catalog health recheck]', error);
    return Response.json(
      { ok: false, error: 'catalog_recheck_failed' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
