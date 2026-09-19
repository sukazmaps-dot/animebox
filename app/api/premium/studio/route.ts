import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import {
  DEFAULT_PREMIUM_STUDIO_SETTINGS,
  isHexColor,
  isPremiumBorderStyle,
  isPremiumProfileTheme,
  studioSettingsFromRow,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';

export const dynamic = 'force-dynamic';

const STUDIO_COLUMNS = [
  'theme',
  'primary_color',
  'accent_color',
  'text_color',
  'glow_strength',
  'border_style',
  'avatar_path',
  'avatar_static_path',
  'avatar_position_x',
  'avatar_position_y',
  'avatar_zoom',
  'banner_path',
  'banner_static_path',
  'banner_position_x',
  'banner_position_y',
  'banner_zoom',
  'sync_player_theme',
].join(',');

async function requireProfileStudio(userId: string) {
  const entitlements = await getEffectiveUserEntitlements(userId);

  if (!entitlements.profileStudio || !entitlements.premiumThemes) {
    throw new ApiError(403, 'Profile Studio доступна только с AnimeBox Premium.');
  }

  return entitlements;
}

function safeMediaPath(value: unknown, userId: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Некорректный путь Premium-медиа.');
  }

  const path = value.trim();
  if (
    path.length > 360 ||
    !path.startsWith(`${userId}/premium/`) ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    throw new ApiError(400, 'Некорректный путь Premium-медиа.');
  }

  return path;
}


function readPosition(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new ApiError(400, `${label} должна быть от 0 до 100.`);
  }
  return Math.round(number * 10) / 10;
}

function readZoom(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 3) {
    throw new ApiError(400, `${label} должен быть от 1 до 3.`);
  }
  return Math.round(number * 100) / 100;
}

function readSettings(body: Record<string, unknown>, userId: string): PremiumStudioSettings {
  const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
  const primaryColor =
    typeof body.primaryColor === 'string' ? body.primaryColor.trim().toUpperCase() : '';
  const accentColor =
    typeof body.accentColor === 'string' ? body.accentColor.trim().toUpperCase() : '';
  const textColor =
    typeof body.textColor === 'string' ? body.textColor.trim().toUpperCase() : '';
  const borderStyle =
    typeof body.borderStyle === 'string' ? body.borderStyle.trim() : '';
  const glowStrength = Number(body.glowStrength);

  if (!isPremiumProfileTheme(theme)) {
    throw new ApiError(400, 'Неизвестная тема Profile Studio.');
  }
  if (!isHexColor(primaryColor) || !isHexColor(accentColor) || !isHexColor(textColor)) {
    throw new ApiError(400, 'Цвета Profile Studio должны быть в формате #RRGGBB.');
  }
  if (!isPremiumBorderStyle(borderStyle)) {
    throw new ApiError(400, 'Неизвестный стиль рамки.');
  }
  if (!Number.isFinite(glowStrength) || glowStrength < 0 || glowStrength > 100) {
    throw new ApiError(400, 'Интенсивность свечения должна быть от 0 до 100.');
  }
  if (typeof body.syncPlayerTheme !== 'boolean') {
    throw new ApiError(400, 'Некорректная настройка темы плеера.');
  }

  return {
    theme,
    primaryColor,
    accentColor,
    textColor,
    glowStrength: Math.round(glowStrength),
    borderStyle,
    avatarPath: safeMediaPath(body.avatarPath, userId),
    avatarStaticPath: safeMediaPath(body.avatarStaticPath, userId),
    avatarPositionX: readPosition(body.avatarPositionX, 'Позиция аватара по X'),
    avatarPositionY: readPosition(body.avatarPositionY, 'Позиция аватара по Y'),
    avatarZoom: readZoom(body.avatarZoom, 'Масштаб аватара'),
    bannerPath: safeMediaPath(body.bannerPath, userId),
    bannerStaticPath: safeMediaPath(body.bannerStaticPath, userId),
    bannerPositionX: readPosition(body.bannerPositionX, 'Позиция баннера по X'),
    bannerPositionY: readPosition(body.bannerPositionY, 'Позиция баннера по Y'),
    bannerZoom: readZoom(body.bannerZoom, 'Масштаб баннера'),
    syncPlayerTheme: body.syncPlayerTheme,
  };
}

export async function GET() {
  try {
    const { user } = await userClient();
    const entitlements = await getEffectiveUserEntitlements(user.id);
    const admin = adminClient();

    const { data, error } = await admin
      .from('premium_profile_settings')
      .select(STUDIO_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    const allowed = Boolean(entitlements.profileStudio && entitlements.premiumThemes);
    const settings = studioSettingsFromRow(data as Record<string, unknown> | null);

    return response({
      allowed,
      theme: settings.theme,
      // Keep the saved appearance available to the owner after expiry so
      // AnimeBox can resolve static media fallbacks without re-enabling
      // Premium-only colors/effects. The client still receives allowed=false.
      settings,
      entitlements,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    await requireProfileStudio(user.id);

    const body = await readBody(request);
    const settings = readSettings(body, user.id);

    const { error } = await adminClient()
      .from('premium_profile_settings')
      .upsert(
        {
          user_id: user.id,
          theme: settings.theme,
          primary_color: settings.primaryColor,
          accent_color: settings.accentColor,
          text_color: settings.textColor,
          glow_strength: settings.glowStrength,
          border_style: settings.borderStyle,
          avatar_path: settings.avatarPath,
          avatar_static_path: settings.avatarStaticPath,
          avatar_position_x: settings.avatarPositionX,
          avatar_position_y: settings.avatarPositionY,
          avatar_zoom: settings.avatarZoom,
          banner_path: settings.bannerPath,
          banner_static_path: settings.bannerStaticPath,
          banner_position_x: settings.bannerPositionX,
          banner_position_y: settings.bannerPositionY,
          banner_zoom: settings.bannerZoom,
          sync_player_theme: settings.syncPlayerTheme,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    return response({ ok: true, theme: settings.theme, settings });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const media = url.searchParams.get('media') || 'all';

    if (!['avatar', 'banner', 'all'].includes(media)) {
      throw new ApiError(400, 'Неизвестный тип Premium-медиа.');
    }

    const admin = adminClient();
    const { data: row, error: lookupError } = await admin
      .from('premium_profile_settings')
      .select(STUDIO_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!row) return response({ ok: true, settings: DEFAULT_PREMIUM_STUDIO_SETTINGS });

    const current = studioSettingsFromRow(row as unknown as Record<string, unknown>);
    const next: PremiumStudioSettings = {
      ...current,
      ...(media === 'avatar' || media === 'all'
        ? {
            avatarPath: null,
            avatarStaticPath: null,
            avatarPositionX: 50,
            avatarPositionY: 50,
            avatarZoom: 1,
          }
        : {}),
      ...(media === 'banner' || media === 'all'
        ? {
            bannerPath: null,
            bannerStaticPath: null,
            bannerPositionX: 50,
            bannerPositionY: 50,
            bannerZoom: 1,
          }
        : {}),
    };

    const { error: updateError } = await admin
      .from('premium_profile_settings')
      .update({
        avatar_path: next.avatarPath,
        avatar_static_path: next.avatarStaticPath,
        avatar_position_x: next.avatarPositionX,
        avatar_position_y: next.avatarPositionY,
        avatar_zoom: next.avatarZoom,
        banner_path: next.bannerPath,
        banner_static_path: next.bannerStaticPath,
        banner_position_x: next.bannerPositionX,
        banner_position_y: next.bannerPositionY,
        banner_zoom: next.bannerZoom,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    const paths = [
      ...(media === 'avatar' || media === 'all'
        ? [current.avatarPath, current.avatarStaticPath]
        : []),
      ...(media === 'banner' || media === 'all'
        ? [current.bannerPath, current.bannerStaticPath]
        : []),
    ].filter((path): path is string => Boolean(path && path.startsWith(`${user.id}/premium/`)));

    if (paths.length) {
      const { error: removeError } = await admin.storage
        .from('profile-media')
        .remove([...new Set(paths)]);
      if (removeError) console.error('[Premium Studio] media cleanup:', removeError);
    }

    return response({ ok: true, settings: next });
  } catch (error) {
    return failure(error);
  }
}
