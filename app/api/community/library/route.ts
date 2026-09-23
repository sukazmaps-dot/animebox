import {
  adminClient,
  userClient,
  response,
  failure,
  positiveInteger,
  readBody,
  ensureAnime,
  ApiError,
} from '@/lib/community-server';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'community_library_write_ip', limit: 90, windowSeconds: 60 },
      user: { scope: 'community_library_write_user', limit: 60, windowSeconds: 60 },
    });
    if (limited) return limited;
    const body = await readBody(request);
    const id = positiveInteger(body.animeId);

    if (!['watching', 'planned', 'completed', 'dropped'].includes(String(body.status))) {
      throw new ApiError(400, 'Неизвестный статус.');
    }

    await ensureAnime(id);

    const { error } = await client.rpc('set_library_status', {
      p_anime: id,
      p_status: body.status,
    });

    if (error) throw error;
    return response({ saved: true });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Removes only the library/tracker entry.
 * Watch progress, heartbeats, achievements and history stay intact so an
 * accidental cleanup of the tracker never destroys viewing data.
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'community_library_delete_ip', limit: 90, windowSeconds: 60 },
      user: { scope: 'community_library_delete_user', limit: 60, windowSeconds: 60 },
    });
    if (limited) return limited;
    const body = await readBody(request);
    const id = positiveInteger(body.animeId);

    // Authenticate with the user's session first, then perform one narrowly
    // scoped service-role delete. This keeps the endpoint working even on
    // projects where anime_library does not yet have a DELETE RLS policy.
    const admin = adminClient();
    const { data, error } = await admin
      .from('anime_library')
      .delete()
      .eq('user_id', user.id)
      .eq('anime_id', id)
      .select('anime_id')
      .maybeSingle();

    if (error) throw error;

    return response({
      removed: Boolean(data),
      animeId: id,
      progressPreserved: true,
    });
  } catch (error) {
    return failure(error);
  }
}
