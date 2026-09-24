import {
  ApiError,
  ensureAnime,
  failure,
  positiveInteger,
  readJsonBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { getProfileWidgetsData } from '@/lib/profile-widgets-server';
import {
  PROFILE_WIDGET_KEYS,
  type ProfileWidgetKey,
} from '@/types/profile-widgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLayout(value: unknown) {
  if (!Array.isArray(value) || value.length !== PROFILE_WIDGET_KEYS.length) {
    throw new ApiError(400, 'Некорректный список виджетов.');
  }

  const seen = new Set<ProfileWidgetKey>();

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ApiError(400, 'Некорректный виджет профиля.');
    }

    const row = entry as Record<string, unknown>;
    const key = String(row.key || '') as ProfileWidgetKey;

    if (!PROFILE_WIDGET_KEYS.includes(key) || seen.has(key)) {
      throw new ApiError(400, 'Некорректный или повторяющийся виджет.');
    }

    seen.add(key);

    return {
      widget_key: key,
      position: index,
      visible: row.visible !== false,
    };
  });
}

function parseFavoriteIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'Некорректный список любимых аниме.');
  }

  const ids = value.map((entry) => positiveInteger(Number(entry)));
  const unique = [...new Set(ids)];

  if (unique.length !== ids.length) {
    throw new ApiError(400, 'Любимые аниме не должны повторяться.');
  }

  if (unique.length > 6) {
    throw new ApiError(400, 'Можно закрепить максимум 6 любимых аниме.');
  }

  return unique;
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'profile_widgets_write_ip', limit: 60, windowSeconds: 60 },
      user: { scope: 'profile_widgets_write_user', limit: 30, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 12_000 });
    const action = String(body.action || '');

    if (action === 'save_layout') {
      const layout = parseLayout(body.layout);

      const { error } = await client
        .from('profile_widgets')
        .upsert(
          layout.map((item) => ({
            user_id: user.id,
            ...item,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id,widget_key' },
        );

      if (error) throw error;
    } else if (action === 'set_favorites') {
      const animeIds = parseFavoriteIds(body.animeIds);

      await Promise.all(animeIds.map((animeId) => ensureAnime(animeId)));

      const { data: existing, error: existingError } = await client
        .from('profile_favorite_anime')
        .select('anime_id')
        .eq('user_id', user.id);

      if (existingError) throw existingError;

      const nextSet = new Set(animeIds);
      const removed = (existing ?? [])
        .map((row) => Number(row.anime_id))
        .filter((animeId) => Number.isSafeInteger(animeId) && !nextSet.has(animeId));

      if (removed.length) {
        const { error: deleteError } = await client
          .from('profile_favorite_anime')
          .delete()
          .eq('user_id', user.id)
          .in('anime_id', removed);

        if (deleteError) throw deleteError;
      }

      if (animeIds.length) {
        const { error: upsertError } = await client
          .from('profile_favorite_anime')
          .upsert(
            animeIds.map((animeId, position) => ({
              user_id: user.id,
              anime_id: animeId,
              position,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'user_id,anime_id' },
          );

        if (upsertError) throw upsertError;
      }
    } else {
      throw new ApiError(400, 'Неизвестное действие.');
    }

    return response({
      ok: true,
      widgets: await getProfileWidgetsData(user.id),
    });
  } catch (error) {
    return failure(error);
  }
}
