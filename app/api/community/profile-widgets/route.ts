import {
  ApiError,
  ensureAnimes,
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

export async function GET() {
  try {
    const { user } = await userClient();
    return response({
      ok: true,
      widgets: await getProfileWidgetsData(user.id),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'profile_widgets_write_ip', limit: 45, windowSeconds: 60 },
      user: { scope: 'profile_widgets_write_user', limit: 20, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 12_000 });
    const action = String(body.action || '');

    if (action !== 'save_identity') {
      throw new ApiError(400, 'Неизвестное действие.');
    }

    const layout = parseLayout(body.layout);
    const animeIds = parseFavoriteIds(body.animeIds);

    await ensureAnimes(animeIds);

    const { error } = await client.rpc('save_my_profile_identity', {
      p_layout: layout,
      p_anime_ids: animeIds,
    });

    if (error) throw error;

    return response({
      ok: true,
      widgets: await getProfileWidgetsData(user.id),
    });
  } catch (error) {
    return failure(error);
  }
}
