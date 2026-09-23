import {
  ApiError,
  adminClient,
  assertBrowserMutationRequest,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import {
  DEFAULT_PREMIUM_STUDIO_SETTINGS,
  studioSettingsFromRow,
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

export async function GET() {
  try {
    const { user } = await userClient();
    const [entitlements, result] = await Promise.all([
      getEffectiveUserEntitlements(user.id),
      adminClient()
        .from('premium_profile_settings')
        .select(STUDIO_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (result.error) throw result.error;

    const settings = studioSettingsFromRow(result.data as Record<string, unknown> | null);
    const allowed = Boolean(entitlements.profileStudio && entitlements.premiumThemes);

    return response({ allowed, theme: settings.theme, settings, entitlements });
  } catch (error) {
    return failure(error);
  }
}

// Profile System v2 has one write path. Keeping the legacy POST writable would
// let an old/stale client skip the profile-media moderation gate.
export async function POST() {
  return failure(
    new ApiError(
      410,
      'Profile Studio теперь сохраняется через единый редактор профиля. Обновите страницу.',
    ),
  );
}

export async function DELETE(request: Request) {
  try {
    assertBrowserMutationRequest(request);
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
    const next = {
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
      const { error: removeError } = await admin.storage.from('profile-media').remove([...new Set(paths)]);
      if (removeError) console.error('[Premium Studio] media cleanup:', removeError);
    }

    return response({ ok: true, settings: next });
  } catch (error) {
    return failure(error);
  }
}
