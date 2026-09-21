import 'server-only';

import { createHash } from 'node:crypto';

import { ApiError, adminClient } from '@/lib/community-server';

export type ProfileMediaScope = 'base' | 'premium';
export type ProfileMediaKind = 'avatar' | 'banner';
export type ProfileMediaVariant = 'original' | 'static';

export type ProfileMediaCandidate = {
  variant: ProfileMediaVariant;
  path: string;
  quarantinePath: string;
};

export type ProfileMediaCandidateGroup = {
  scope: ProfileMediaScope;
  kind: ProfileMediaKind;
  applyPayload: Record<string, unknown>;
  candidates: ProfileMediaCandidate[];
};

type LoadedMedia = {
  candidate: ProfileMediaCandidate;
  bytes: Buffer;
  mimeType: string;
  size: number;
  sha256: string;
  animated: boolean;
};

type AuditRow = {
  user_id: string;
  scope: ProfileMediaScope;
  kind: ProfileMediaKind;
  variant: ProfileMediaVariant;
  public_path: string;
  quarantine_path: null;
  sha256: string;
  mime_type: string;
  file_size: number;
  animated: boolean;
  status: 'approved';
  reason: 'technical_checks_only';
  provider: 'disabled';
  provider_model: null;
  categories: Record<string, never>;
  category_scores: Record<string, never>;
  moderation_result: {
    ai_moderation_enabled: false;
    technical_checks_passed: true;
  };
};

export type ProfileMediaPublishResult = {
  publishedPaths: string[];
  quarantinePaths: string[];
  auditRows: AuditRow[];
};

const PUBLIC_BUCKET = 'profile-media';
const QUARANTINE_BUCKET = 'profile-media-quarantine';

function maxAllowedBytes(scope: ProfileMediaScope, kind: ProfileMediaKind) {
  if (scope === 'premium') {
    return kind === 'avatar' ? 2 * 1024 * 1024 : 6 * 1024 * 1024;
  }
  return 5 * 1024 * 1024;
}

function inferMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

function hasExpectedImageSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
  }

  if (mimeType === 'image/gif') {
    const header = bytes.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }

  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

function detectAnimation(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/gif') return true;
  if (mimeType === 'image/webp') return bytes.includes(Buffer.from('ANIM'));
  if (mimeType === 'image/png') return bytes.includes(Buffer.from('acTL'));
  return false;
}

async function loadCandidate(candidate: ProfileMediaCandidate): Promise<LoadedMedia> {
  const { data, error } = await adminClient()
    .storage
    .from(QUARANTINE_BUCKET)
    .download(candidate.quarantinePath);

  if (error || !data) {
    throw new ApiError(
      400,
      'Не удалось проверить приватно загруженное изображение. Загрузите файл заново.',
    );
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const storageMime = data.type?.trim().toLowerCase();
  const mimeType =
    storageMime &&
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(storageMime)
      ? storageMime
      : inferMimeType(candidate.path);

  return {
    candidate,
    bytes,
    mimeType,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    animated: detectAnimation(bytes, mimeType),
  };
}

function validateTechnicalMedia(
  group: ProfileMediaCandidateGroup,
  item: LoadedMedia,
) {
  if (item.size < 1 || item.size > maxAllowedBytes(group.scope, group.kind)) {
    throw new ApiError(413, 'Изображение превышает допустимый размер.');
  }

  if (!hasExpectedImageSignature(item.bytes, item.mimeType)) {
    throw new ApiError(
      400,
      'Файл не прошёл техническую проверку изображения. Загрузите JPG, PNG, WebP или GIF заново.',
    );
  }
}

async function removePaths(bucket: string, paths: string[]) {
  if (!paths.length) return;
  const { error } = await adminClient().storage.from(bucket).remove(paths);
  if (error) {
    console.error('[ProfileMediaPublish] cleanup failed:', bucket, error);
  }
}

export async function publishProfileMediaGroups(
  userId: string,
  groups: ProfileMediaCandidateGroup[],
): Promise<ProfileMediaPublishResult> {
  const result: ProfileMediaPublishResult = {
    publishedPaths: [],
    quarantinePaths: [],
    auditRows: [],
  };

  try {
    for (const group of groups) {
      if (!group.candidates.length) continue;

      const items = await Promise.all(group.candidates.map(loadCandidate));
      for (const item of items) validateTechnicalMedia(group, item);

      for (const item of items) {
        const uploadBody = Uint8Array.from(item.bytes).buffer;
        const uploaded = await adminClient()
          .storage
          .from(PUBLIC_BUCKET)
          .upload(item.candidate.path, uploadBody, {
            contentType: item.mimeType,
            cacheControl: '31536000',
            upsert: false,
          });

        if (uploaded.error) {
          console.error('[ProfileMediaPublish] public upload failed:', {
            path: item.candidate.path,
            mimeType: item.mimeType,
            size: item.size,
            error: uploaded.error,
          });
          throw new ApiError(
            503,
            'Не удалось опубликовать изображение в хранилище. Попробуйте ещё раз через несколько секунд.',
          );
        }

        result.publishedPaths.push(item.candidate.path);
        result.quarantinePaths.push(item.candidate.quarantinePath);
        result.auditRows.push({
          user_id: userId,
          scope: group.scope,
          kind: group.kind,
          variant: item.candidate.variant,
          public_path: item.candidate.path,
          quarantine_path: null,
          sha256: item.sha256,
          mime_type: item.mimeType,
          file_size: item.size,
          animated: item.animated,
          status: 'approved',
          reason: 'technical_checks_only',
          provider: 'disabled',
          provider_model: null,
          categories: {},
          category_scores: {},
          moderation_result: {
            ai_moderation_enabled: false,
            technical_checks_passed: true,
          },
        });
      }
    }

    return result;
  } catch (error) {
    await removePaths(PUBLIC_BUCKET, result.publishedPaths);
    throw error;
  }
}

export async function finalizeProfileMediaPublish(result: ProfileMediaPublishResult) {
  if (result.auditRows.length) {
    const { error } = await adminClient()
      .from('profile_media_moderation')
      .insert(result.auditRows);

    if (error) {
      // Audit must never block a successfully saved profile.
      console.error('[ProfileMediaPublish] audit write failed:', error);
    }
  }

  await removePaths(QUARANTINE_BUCKET, result.quarantinePaths);
}

export async function rollbackProfileMediaPublish(result: ProfileMediaPublishResult) {
  await Promise.all([
    removePaths(PUBLIC_BUCKET, result.publishedPaths),
    removePaths(QUARANTINE_BUCKET, result.quarantinePaths),
  ]);
}
