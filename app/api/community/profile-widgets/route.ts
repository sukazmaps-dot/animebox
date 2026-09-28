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
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { getEffectivePremiumState } from '@/lib/premium-server';
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

function parseFavoriteIds(value: unknown, maxFavorites: number) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'Некорректный список любимых аниме.');
  }

  const ids = value.map((entry) => positiveInteger(Number(entry)));
  const unique = [...new Set(ids)];

  if (unique.length !== ids.length) {
    throw new ApiError(400, 'Любимые аниме не должны повторяться.');
  }

  if (unique.length > maxFavorites) {
    throw new ApiError(
      400,
      `Можно закрепить максимум ${maxFavorites} любимых аниме.`,
    );
  }

  return unique;
}

async function getShowcaseCapabilities(userId: string) {
  const lifecycle = await getEffectivePremiumState(userId);
  const entitlements = await getEffectiveUserEntitlements(userId);
  const extraShowcases = Boolean(
    lifecycle.active && entitlements.extraShowcases,
  );

  return {
    extraShowcases,
    maxFavorites: extraShowcases ? 12 : 6,
  };
}

export async function GET() {
  try {
    const { user } = await userClient();
    const [widgets, capabilities] = await Promise.all([
      getProfileWidgetsData(user.id),
      getShowcaseCapabilities(user.id),
    ]);

    return response({
      ok: true,
      widgets,
      capabilities,
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
    const capabilities = await getShowcaseCapabilities(user.id);
    const animeIds = parseFavoriteIds(
      body.animeIds,
      capabilities.maxFavorites,
    );

    await ensureAnimes(animeIds);

    const { error } = await client.rpc('save_my_profile_identity', {
      p_layout: layout,
      p_anime_ids: animeIds,
    });

    if (error) throw error;

    return response({
      ok: true,
      widgets: await getProfileWidgetsData(user.id),
      capabilities,
    });
  } catch (error) {
    return failure(error);
  }
}
