import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { TELEGRAM_BOT_USERNAME } from '@/lib/telegram-links';

const LINK_METADATA_KEY = 'animebox_telegram_link';
const ACCOUNT_METADATA_KEY = 'animebox_telegram_account';
const LINK_TTL_MS = 5 * 60 * 1000;

type LinkMetadata = {
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

type AccountMetadata = {
  username: string | null;
  firstName: string | null;
  linkedAt: string;
};

export type TelegramAccountLinkStatus = {
  linked: boolean;
  pending: boolean;
  canUnlink: boolean;
  displayName: string | null;
};

export type TelegramAccountLinkConsumeResult =
  | { ok: true; alreadyLinked: boolean; userId: string }
  | {
      ok: false;
      error:
        | 'invalid_link'
        | 'expired_link'
        | 'profile_not_found'
        | 'telegram_already_linked'
        | 'account_has_other_telegram'
        | 'link_failed';
    };

function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function compactUserId(userId: string) {
  const hex = userId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error('invalid_user_id');
  }

  return Buffer.from(hex, 'hex').toString('base64url');
}

function expandUserId(value: string) {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length !== 16) return null;

    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  } catch {
    return null;
  }
}

function appMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function readLinkMetadata(value: unknown): LinkMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const tokenHash = typeof row.tokenHash === 'string' ? row.tokenHash : '';
  const expiresAt = Number(row.expiresAt);
  const createdAt = Number(row.createdAt);

  if (!tokenHash || !Number.isFinite(expiresAt) || !Number.isFinite(createdAt)) {
    return null;
  }

  return { tokenHash, expiresAt, createdAt };
}

function readAccountMetadata(value: unknown): AccountMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const linkedAt = typeof row.linkedAt === 'string' ? row.linkedAt : '';
  if (!linkedAt) return null;

  return {
    username: typeof row.username === 'string' && row.username.trim()
      ? row.username.trim()
      : null,
    firstName: typeof row.firstName === 'string' && row.firstName.trim()
      ? row.firstName.trim()
      : null,
    linkedAt,
  };
}

function isTelegramOnlyAccount(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const source =
    typeof user.user_metadata?.auth_source === 'string'
      ? user.user_metadata.auth_source
      : '';

  const email = user.email?.toLowerCase() ?? '';

  return (
    source === 'telegram' ||
    email.endsWith('@telegram.animebox.invalid') ||
    email.endsWith('@users.youranimebox.com')
  );
}

export async function getTelegramAccountLinkStatus(
  userId: string,
): Promise<TelegramAccountLinkStatus> {
  const admin = createSupabaseAdmin();

  const [{ data: profile, error: profileError }, { data: authData, error: authError }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('telegram_id')
        .eq('id', userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);

  if (profileError) throw profileError;
  if (authError || !authData.user) throw authError ?? new Error('auth_user_not_found');

  const metadata = appMetadataObject(authData.user.app_metadata);
  const link = readLinkMetadata(metadata[LINK_METADATA_KEY]);
  const account = readAccountMetadata(metadata[ACCOUNT_METADATA_KEY]);
  const linked = profile?.telegram_id != null;

  return {
    linked,
    pending: Boolean(link && link.expiresAt > Date.now()),
    canUnlink: linked && !isTelegramOnlyAccount(authData.user),
    displayName: linked
      ? account?.username
        ? `@${account.username.replace(/^@/, '')}`
        : account?.firstName ?? null
      : null,
  };
}

export async function createTelegramAccountLink(userId: string) {
  const admin = createSupabaseAdmin();

  const [{ data: profile, error: profileError }, { data: authData, error: authError }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('telegram_id')
        .eq('id', userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);

  if (profileError) throw profileError;
  if (!profile) throw new Error('profile_not_found');
  if (authError || !authData.user) throw authError ?? new Error('auth_user_not_found');

  if (profile.telegram_id != null) {
    return {
      linked: true as const,
      deepLink: null,
      expiresAt: null,
    };
  }

  const secret = randomBytes(18).toString('base64url');
  const now = Date.now();
  const expiresAt = now + LINK_TTL_MS;
  const startParam = `link_${compactUserId(userId)}.${secret}`;

  const metadata = appMetadataObject(authData.user.app_metadata);
  metadata[LINK_METADATA_KEY] = {
    tokenHash: hashSecret(secret),
    createdAt: now,
    expiresAt,
  } satisfies LinkMetadata;

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });

  if (updateError) throw updateError;

  return {
    linked: false as const,
    deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(startParam)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function consumeTelegramAccountLink(input: {
  startParam: string;
  telegramId: string;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
}): Promise<TelegramAccountLinkConsumeResult> {
  const match = input.startParam.match(
    /^link_([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{24})$/,
  );

  if (!match) return { ok: false, error: 'invalid_link' };

  const userId = expandUserId(match[1]);
  const secret = match[2];

  if (!userId || !/^\d+$/.test(input.telegramId)) {
    return { ok: false, error: 'invalid_link' };
  }

  const admin = createSupabaseAdmin();

  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(userId);

  if (authError || !authData.user) {
    return { ok: false, error: 'invalid_link' };
  }

  const metadata = appMetadataObject(authData.user.app_metadata);
  const link = readLinkMetadata(metadata[LINK_METADATA_KEY]);

  if (!link || !safeEqual(link.tokenHash, hashSecret(secret))) {
    return { ok: false, error: 'invalid_link' };
  }

  if (link.expiresAt <= Date.now()) {
    return { ok: false, error: 'expired_link' };
  }

  const [
    { data: currentProfile, error: currentProfileError },
    { data: telegramOwner, error: telegramOwnerError },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id,telegram_id')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id')
      .eq('telegram_id', input.telegramId)
      .maybeSingle(),
  ]);

  if (currentProfileError || telegramOwnerError) {
    return { ok: false, error: 'link_failed' };
  }

  if (!currentProfile) {
    return { ok: false, error: 'profile_not_found' };
  }

  if (
    currentProfile.telegram_id != null &&
    String(currentProfile.telegram_id) !== input.telegramId
  ) {
    return { ok: false, error: 'account_has_other_telegram' };
  }

  if (telegramOwner && telegramOwner.id !== userId) {
    return { ok: false, error: 'telegram_already_linked' };
  }

  let alreadyLinked =
    currentProfile.telegram_id != null &&
    String(currentProfile.telegram_id) === input.telegramId;

  if (!alreadyLinked) {
    const {
      data: linkedProfile,
      error: linkError,
    } = await admin
      .from('profiles')
      .update({ telegram_id: input.telegramId })
      .eq('id', userId)
      .is('telegram_id', null)
      .select('id,telegram_id')
      .maybeSingle();

    if (linkError) {
      if (linkError.code === '23505') {
        return { ok: false, error: 'telegram_already_linked' };
      }

      return { ok: false, error: 'link_failed' };
    }

    if (!linkedProfile) {
      const { data: latestProfile, error: latestProfileError } = await admin
        .from('profiles')
        .select('telegram_id')
        .eq('id', userId)
        .maybeSingle();

      if (latestProfileError || !latestProfile) {
        return { ok: false, error: 'link_failed' };
      }

      if (String(latestProfile.telegram_id ?? '') !== input.telegramId) {
        return { ok: false, error: 'account_has_other_telegram' };
      }

      alreadyLinked = true;
    }
  }

  delete metadata[LINK_METADATA_KEY];
  metadata[ACCOUNT_METADATA_KEY] = {
    username: input.telegramUsername?.trim() || null,
    firstName: input.telegramFirstName?.trim() || null,
    linkedAt: new Date().toISOString(),
  } satisfies AccountMetadata;

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });

  if (metadataError) {
    console.warn('[Telegram Account Link] linked but metadata sync failed:', metadataError);
  }

  return { ok: true, alreadyLinked, userId };
}

export async function unlinkTelegramAccount(userId: string) {
  const admin = createSupabaseAdmin();

  const { data: authData, error: authError } =
    await admin.auth.admin.getUserById(userId);

  if (authError || !authData.user) {
    throw authError ?? new Error('auth_user_not_found');
  }

  if (isTelegramOnlyAccount(authData.user)) {
    return { ok: false as const, error: 'telegram_only_account' as const };
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ telegram_id: null })
    .eq('id', userId);

  if (updateError) throw updateError;

  const metadata = appMetadataObject(authData.user.app_metadata);
  delete metadata[LINK_METADATA_KEY];
  delete metadata[ACCOUNT_METADATA_KEY];

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: metadata,
  });

  if (metadataError) {
    console.warn('[Telegram Account Link] unlink metadata cleanup failed:', metadataError);
  }

  return { ok: true as const };
}
