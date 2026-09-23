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
  isHexColor,
  isPremiumBorderStyle,
  isPremiumProfileTheme,
  studioSettingsFromRow,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';
import {
  finalizeProfileMediaPublish,
  publishProfileMediaGroups,
  rollbackProfileMediaPublish,
  type ProfileMediaCandidateGroup,
  type ProfileMediaPublishResult,
} from '@/lib/profile-media-publish-server';
import { enforceIpAndUserRateLimit, enforceUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILE_COLUMNS = 'id,username,bio,avatar_path,banner_path,created_at';
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

type ProfilePatch = {
  username: string;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
};

type ExistingProfile = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
};


type PendingMediaUpload = {
  scope: 'base' | 'premium';
  kind: 'avatar' | 'banner';
  variant: 'original' | 'static';
  publicPath: string;
  quarantinePath: string;
};

function readPendingMedia(value: unknown, userId: string): PendingMediaUpload[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) {
    throw new ApiError(400, 'Некорректный список загруженных медиа.');
  }

  return value.map((raw) => {
    const item = objectValue(raw, 'Медиа');
    const scope = item.scope;
    const kind = item.kind;
    const variant = item.variant;
    const publicPath = typeof item.publicPath === 'string' ? item.publicPath.trim() : '';
    const quarantinePath = typeof item.quarantinePath === 'string' ? item.quarantinePath.trim() : '';

    if (scope !== 'base' && scope !== 'premium') throw new ApiError(400, 'Некорректный scope медиа.');
    if (kind !== 'avatar' && kind !== 'banner') throw new ApiError(400, 'Некорректный тип медиа.');
    if (variant !== 'original' && variant !== 'static') throw new ApiError(400, 'Некорректный вариант медиа.');
    if (scope === 'base' && variant !== 'original') throw new ApiError(400, 'Базовое медиа не может иметь static-вариант.');

    const q = quarantinePath.split('/');
    if (q.length !== 6 || q[0] !== userId || q[1] !== 'pending' || q[2] !== scope || q[3] !== kind) {
      throw new ApiError(400, 'Некорректный путь приватной загрузки.');
    }
    const uploadId = q[4];
    const qMatch = q[5]?.match(/^(original|static)\.(jpg|png|webp|gif)$/i);
    if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !qMatch || qMatch[1] !== variant) {
      throw new ApiError(400, 'Некорректный идентификатор приватной загрузки.');
    }

    const extension = qMatch[2].toLowerCase();
    const expectedPublic = scope === 'premium'
      ? `${userId}/premium/${kind}${variant === 'static' ? '-static' : ''}-${uploadId}.${extension}`
      : `${userId}/${kind}-${uploadId}.${extension}`;

    if (publicPath !== expectedPublic) {
      throw new ApiError(400, 'Публичный путь не соответствует приватной загрузке.');
    }

    return { scope, kind, variant, publicPath, quarantinePath };
  });
}

function pendingCandidate(
  uploads: PendingMediaUpload[],
  scope: PendingMediaUpload['scope'],
  kind: PendingMediaUpload['kind'],
  variant: PendingMediaUpload['variant'],
  path: string,
) {
  const match = uploads.find((item) =>
    item.scope === scope &&
    item.kind === kind &&
    item.variant === variant &&
    item.publicPath === path
  );

  if (!match) {
    throw new ApiError(409, 'Новый аватар или баннер должен быть загружен через приватную проверку AnimeBox.');
  }

  return { variant, path, quarantinePath: match.quarantinePath };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${label}: некорректные данные.`);
  }
  return value as Record<string, unknown>;
}

function safeBaseMediaPath(value: unknown, userId: string, label: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, `${label}: некорректный путь.`);
  const path = value.trim();
  if (
    path.length > 360 ||
    !path.startsWith(`${userId}/`) ||
    path.includes('/premium/') ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    throw new ApiError(400, `${label}: некорректный путь.`);
  }
  return path;
}

function safePremiumMediaPath(value: unknown, userId: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, 'Некорректный путь Premium-медиа.');
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

function readProfilePatch(value: unknown, userId: string): ProfilePatch {
  const data = objectValue(value, 'Профиль');
  const username = typeof data.username === 'string' ? data.username.trim() : '';
  const bio = typeof data.bio === 'string' ? data.bio.trim() : '';

  if (username.length < 3 || username.length > 24) {
    throw new ApiError(400, 'Ник должен содержать от 3 до 24 символов.');
  }
  if (bio.length > 300) throw new ApiError(400, 'Описание не может быть длиннее 300 символов.');

  return {
    username,
    bio: bio || null,
    avatar_path: safeBaseMediaPath(data.avatarPath, userId, 'Аватар'),
    banner_path: safeBaseMediaPath(data.bannerPath, userId, 'Баннер'),
  };
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

function readStudioSettings(value: unknown, userId: string): PremiumStudioSettings {
  const data = objectValue(value, 'Оформление');
  const theme = typeof data.theme === 'string' ? data.theme.trim() : '';
  const primaryColor = typeof data.primaryColor === 'string' ? data.primaryColor.trim().toUpperCase() : '';
  const accentColor = typeof data.accentColor === 'string' ? data.accentColor.trim().toUpperCase() : '';
  const textColor = typeof data.textColor === 'string' ? data.textColor.trim().toUpperCase() : '';
  const borderStyle = typeof data.borderStyle === 'string' ? data.borderStyle.trim() : '';
  const glowStrength = Number(data.glowStrength);

  if (!isPremiumProfileTheme(theme)) throw new ApiError(400, 'Неизвестная тема профиля.');
  if (!isHexColor(primaryColor) || !isHexColor(accentColor) || !isHexColor(textColor)) {
    throw new ApiError(400, 'Цвета должны быть в формате #RRGGBB.');
  }
  if (!isPremiumBorderStyle(borderStyle)) throw new ApiError(400, 'Неизвестный стиль рамки.');
  if (!Number.isFinite(glowStrength) || glowStrength < 0 || glowStrength > 100) {
    throw new ApiError(400, 'Интенсивность свечения должна быть от 0 до 100.');
  }
  if (typeof data.syncPlayerTheme !== 'boolean') {
    throw new ApiError(400, 'Некорректная настройка темы плеера.');
  }

  return {
    theme,
    primaryColor,
    accentColor,
    textColor,
    glowStrength: Math.round(glowStrength),
    borderStyle,
    avatarPath: safePremiumMediaPath(data.avatarPath, userId),
    avatarStaticPath: safePremiumMediaPath(data.avatarStaticPath, userId),
    avatarPositionX: readPosition(data.avatarPositionX, 'Позиция аватара по X'),
    avatarPositionY: readPosition(data.avatarPositionY, 'Позиция аватара по Y'),
    avatarZoom: readZoom(data.avatarZoom, 'Масштаб аватара'),
    bannerPath: safePremiumMediaPath(data.bannerPath, userId),
    bannerStaticPath: safePremiumMediaPath(data.bannerStaticPath, userId),
    bannerPositionX: readPosition(data.bannerPositionX, 'Позиция баннера по X'),
    bannerPositionY: readPosition(data.bannerPositionY, 'Позиция баннера по Y'),
    bannerZoom: readZoom(data.bannerZoom, 'Масштаб баннера'),
    syncPlayerTheme: data.syncPlayerTheme,
  };
}

function studioRow(settings: PremiumStudioSettings, userId: string) {
  return {
    user_id: userId,
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
  };
}

function changedMediaGroups(
  profilePatch: ProfilePatch | null,
  oldProfile: ExistingProfile,
  settings: PremiumStudioSettings | null,
  oldSettings: PremiumStudioSettings,
  pendingMedia: PendingMediaUpload[],
): ProfileMediaCandidateGroup[] {
  const groups: ProfileMediaCandidateGroup[] = [];

  if (profilePatch?.avatar_path && profilePatch.avatar_path !== oldProfile.avatar_path) {
    groups.push({
      scope: 'base',
      kind: 'avatar',
      candidates: [pendingCandidate(pendingMedia, 'base', 'avatar', 'original', profilePatch.avatar_path)],
    });
  }

  if (profilePatch?.banner_path && profilePatch.banner_path !== oldProfile.banner_path) {
    groups.push({
      scope: 'base',
      kind: 'banner',
      candidates: [pendingCandidate(pendingMedia, 'base', 'banner', 'original', profilePatch.banner_path)],
    });
  }

  if (settings) {
    const avatarChanged =
      settings.avatarPath !== oldSettings.avatarPath ||
      settings.avatarStaticPath !== oldSettings.avatarStaticPath;

    if (avatarChanged && settings.avatarPath) {
      groups.push({
        scope: 'premium',
        kind: 'avatar',
      candidates: [
          pendingCandidate(pendingMedia, 'premium', 'avatar', 'original', settings.avatarPath),
          ...(settings.avatarStaticPath && settings.avatarStaticPath !== settings.avatarPath
            ? [pendingCandidate(pendingMedia, 'premium', 'avatar', 'static', settings.avatarStaticPath)]
            : []),
        ],
      });
    }

    const bannerChanged =
      settings.bannerPath !== oldSettings.bannerPath ||
      settings.bannerStaticPath !== oldSettings.bannerStaticPath;

    if (bannerChanged && settings.bannerPath) {
      groups.push({
        scope: 'premium',
        kind: 'banner',
      candidates: [
          pendingCandidate(pendingMedia, 'premium', 'banner', 'original', settings.bannerPath),
          ...(settings.bannerStaticPath && settings.bannerStaticPath !== settings.bannerPath
            ? [pendingCandidate(pendingMedia, 'premium', 'banner', 'static', settings.bannerStaticPath)]
            : []),
        ],
      });
    }
  }

  return groups;
}

export async function GET() {
  try {
    const { user } = await userClient();
    const limited = await enforceUserRateLimit(user.id, {
      scope: 'profile_editor_read_user', limit: 60, windowSeconds: 60,
    });
    if (limited) return limited;

    const admin = adminClient();
    const [profileResult, studioResult, entitlements] = await Promise.all([
      admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single(),
      admin.from('premium_profile_settings').select(STUDIO_COLUMNS).eq('user_id', user.id).maybeSingle(),
      getEffectiveUserEntitlements(user.id),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (studioResult.error) throw studioResult.error;

    const settings = studioSettingsFromRow(studioResult.data as Record<string, unknown> | null);
    const allowed = Boolean(entitlements.profileStudio && entitlements.premiumThemes);

    return response({
      profile: profileResult.data,
      settings,
      studio: settings,
      allowed,
      capabilities: {
        premium: allowed,
        profileStudio: Boolean(entitlements.profileStudio),
        premiumThemes: Boolean(entitlements.premiumThemes),
        animatedMedia: Boolean(entitlements.animatedAvatar),
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let mediaPublish: ProfileMediaPublishResult | null = null;

  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'profile_editor_write_ip', limit: 30, windowSeconds: 60 },
      user: { scope: 'profile_editor_write_user', limit: 12, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const hasProfile = Object.prototype.hasOwnProperty.call(body, 'profile');
    const hasStudio = Object.prototype.hasOwnProperty.call(body, 'studio');

    if (!hasProfile && !hasStudio) throw new ApiError(400, 'Нет изменений для сохранения.');

    const admin = adminClient();
    const entitlements = await getEffectiveUserEntitlements(user.id);
    const allowed = Boolean(entitlements.profileStudio && entitlements.premiumThemes);
    const profilePatch = hasProfile ? readProfilePatch(body.profile, user.id) : null;
    const settings = hasStudio ? readStudioSettings(body.studio, user.id) : null;
    const pendingMedia = readPendingMedia(body.pendingMedia, user.id);

    if (settings && !allowed) {
      throw new ApiError(403, 'Расширенное оформление доступно только с AnimeBox Premium.');
    }

    const [oldProfileResult, oldStudioResult] = await Promise.all([
      admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single(),
      admin.from('premium_profile_settings').select(STUDIO_COLUMNS).eq('user_id', user.id).maybeSingle(),
    ]);
    if (oldProfileResult.error) throw oldProfileResult.error;
    if (oldStudioResult.error) throw oldStudioResult.error;

    const oldProfile = oldProfileResult.data as ExistingProfile;
    const oldSettings = studioSettingsFromRow(oldStudioResult.data as Record<string, unknown> | null);

    // Patch 11 post-moderation pipeline:
    // quarantine -> technical validation -> public storage.
    // AI moderation/review/retry is deliberately not part of profile saving.
    mediaPublish = await publishProfileMediaGroups(
      user.id,
      changedMediaGroups(profilePatch, oldProfile, settings, oldSettings, pendingMedia),
    );

    let committedProfile = oldProfileResult.data;
    let committedSettings = oldSettings;
    let profileWritten = false;

    if (profilePatch) {
      const { data, error } = await admin
        .from('profiles')
        .update(profilePatch)
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .single();

      if (error?.code === '23505') throw new ApiError(409, 'Этот ник уже занят.');
      if (error) {
        console.error('[ProfileEditor] profile update failed:', error);
        throw new ApiError(503, 'Не удалось записать профиль в базу данных. Попробуйте ещё раз.');
      }
      committedProfile = data;
      profileWritten = true;
    }

    if (settings) {
      const { error } = await admin
        .from('premium_profile_settings')
        .upsert(studioRow(settings, user.id), { onConflict: 'user_id' });

      if (error) {
        if (profileWritten) {
          await admin
            .from('profiles')
            .update({
              username: oldProfile.username,
              bio: oldProfile.bio,
              avatar_path: oldProfile.avatar_path,
              banner_path: oldProfile.banner_path,
            })
            .eq('id', user.id);
        }
        console.error('[ProfileEditor] studio upsert failed:', error);
        throw new ApiError(503, 'Не удалось записать настройки Premium Studio. Попробуйте ещё раз.');
      }
      committedSettings = settings;
    }

    await finalizeProfileMediaPublish(mediaPublish);
    mediaPublish = null;

    return response({
      ok: true,
      profile: committedProfile,
      settings: committedSettings,
      studio: committedSettings,
      allowed,
      capabilities: {
        premium: allowed,
        profileStudio: Boolean(entitlements.profileStudio),
        premiumThemes: Boolean(entitlements.premiumThemes),
        animatedMedia: Boolean(entitlements.animatedAvatar),
      },
    });
  } catch (error) {
    if (mediaPublish) {
      await rollbackProfileMediaPublish(mediaPublish);
    }
    return failure(error);
  }
}
