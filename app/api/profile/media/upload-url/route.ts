import { randomUUID } from 'node:crypto';

import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

const QUARANTINE_BUCKET = 'profile-media-quarantine';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type Scope = 'base' | 'premium';
type Kind = 'avatar' | 'banner';
type Variant = 'original' | 'static';

function isScope(value: unknown): value is Scope {
  return value === 'base' || value === 'premium';
}

function isKind(value: unknown): value is Kind {
  return value === 'avatar' || value === 'banner';
}

function isVariant(value: unknown): value is Variant {
  return value === 'original' || value === 'static';
}

function maxBytes(scope: Scope, kind: Kind) {
  if (scope === 'premium') {
    return kind === 'avatar' ? 2 * 1024 * 1024 : 6 * 1024 * 1024;
  }
  return 5 * 1024 * 1024;
}

function allowedMime(scope: Scope, variant: Variant, mimeType: string) {
  if (variant === 'static') return scope === 'premium' && mimeType === 'image/webp';
  if (scope === 'base') {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
  }
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);
}

function publicPathFor(
  userId: string,
  scope: Scope,
  kind: Kind,
  variant: Variant,
  uploadId: string,
  extension: string,
) {
  if (scope === 'premium') {
    const suffix = variant === 'static' ? '-static' : '';
    return `${userId}/premium/${kind}${suffix}-${uploadId}.${extension}`;
  }
  return `${userId}/${kind}-${uploadId}.${extension}`;
}

function validateOwnedQuarantinePath(path: string, userId: string) {
  if (path.length > 500 || path.includes('..') || path.includes('\\')) return false;
  const parts = path.split('/');
  if (parts.length !== 6) return false;
  const [owner, pending, scope, kind, uploadId, file] = [
    parts[0],
    parts[1],
    parts[2],
    parts[3],
    parts[4],
    parts[5],
  ];
  if (owner !== userId || pending !== 'pending') return false;
  if (!isScope(scope) || !isKind(kind) || !UUID.test(uploadId)) return false;
  return /^(original|static)\.(jpg|png|webp|gif)$/i.test(file || '');
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'profile_media_write_ip', limit: 40, windowSeconds: 60 },
      user: { scope: 'profile_media_write_user', limit: 24, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const scope = body.scope;
    const kind = body.kind;
    const variant = body.variant;
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
    const size = Number(body.size);

    if (!isScope(scope) || !isKind(kind) || !isVariant(variant)) {
      throw new ApiError(400, 'Некорректный тип профильного медиа.');
    }
    if (!allowedMime(scope, variant, mimeType) || !MIME_EXTENSION[mimeType]) {
      throw new ApiError(400, 'Этот формат изображения не поддерживается.');
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes(scope, kind)) {
      throw new ApiError(413, 'Изображение превышает допустимый размер.');
    }

    if (scope === 'premium') {
      const entitlements = await getEffectiveUserEntitlements(user.id);
      if (!entitlements.profileStudio || !entitlements.premiumThemes) {
        throw new ApiError(403, 'Premium-медиа доступно только с AnimeBox Premium.');
      }
    }

    const uploadId = randomUUID();
    const extension = MIME_EXTENSION[mimeType];
    const quarantinePath = `${user.id}/pending/${scope}/${kind}/${uploadId}/${variant}.${extension}`;
    const publicPath = publicPathFor(user.id, scope, kind, variant, uploadId, extension);

    const signed = await adminClient()
      .storage
      .from(QUARANTINE_BUCKET)
      .createSignedUploadUrl(quarantinePath, { upsert: false });

    if (signed.error || !signed.data?.token) {
      throw signed.error || new Error('Signed upload token was not created');
    }

    return response({
      bucket: QUARANTINE_BUCKET,
      quarantinePath,
      publicPath,
      token: signed.data.token,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'profile_media_delete_ip', limit: 60, windowSeconds: 60 },
      user: { scope: 'profile_media_delete_user', limit: 40, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const raw = Array.isArray(body.quarantinePaths) ? body.quarantinePaths : [];
    const paths = [...new Set(raw)]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => validateOwnedQuarantinePath(value, user.id))
      .slice(0, 8);

    if (!paths.length) return response({ ok: true });

    const removed = await adminClient().storage.from(QUARANTINE_BUCKET).remove(paths);
    if (removed.error) throw removed.error;
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
