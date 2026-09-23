import 'server-only';

import { createHash } from 'node:crypto';

import { ApiError, adminClient } from '@/lib/community-server';
import {
  inspectProfileImageBytes,
  type InspectedProfileImage,
  type SupportedProfileImageMime,
} from '@/lib/profile-media-inspect-server';

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
  candidates: ProfileMediaCandidate[];
};

type LoadedMedia = {
  candidate: ProfileMediaCandidate;
  bytes: Buffer;
  storageMime: string | null;
  inspection: InspectedProfileImage;
  size: number;
  sha256: string;
};

type AuditRow = {
  user_id: string;
  scope: ProfileMediaScope;
  kind: ProfileMediaKind;
  variant: ProfileMediaVariant;
  public_path: string;
  quarantine_path: null;
  sha256: string;
  mime_type: SupportedProfileImageMime;
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
    detected_mime: SupportedProfileImageMime;
    width: number;
    height: number;
    animated: boolean;
  };
};

export type ProfileMediaPublishResult = {
  publishedPaths: string[];
  quarantinePaths: string[];
  auditRows: AuditRow[];
};

const PUBLIC_BUCKET = 'profile-media';
const QUARANTINE_BUCKET = 'profile-media-quarantine';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOGNIZED_STORAGE_MIMES = new Set<SupportedProfileImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function maxAllowedBytes(scope: ProfileMediaScope, kind: ProfileMediaKind) {
  if (scope === 'premium') {
    return kind === 'avatar' ? 2 * 1024 * 1024 : 6 * 1024 * 1024;
  }
  return 5 * 1024 * 1024;
}

function mediaGeometryLimit(
  scope: ProfileMediaScope,
  kind: ProfileMediaKind,
  variant: ProfileMediaVariant,
) {
  if (scope === 'premium' && variant === 'static') {
    return kind === 'avatar'
      ? { maxWidth: 512, maxHeight: 512, maxPixels: 512 * 512 }
      : { maxWidth: 1500, maxHeight: 900, maxPixels: 1500 * 900 };
  }

  if (kind === 'avatar') {
    return {
      maxWidth: 1024,
      maxHeight: 1024,
      maxPixels: 1024 * 1024,
    };
  }

  return {
    maxWidth: 2400,
    maxHeight: 1200,
    maxPixels: 2400 * 1200,
  };
}

function allowedDetectedMime(
  scope: ProfileMediaScope,
  variant: ProfileMediaVariant,
  mimeType: SupportedProfileImageMime,
) {
  if (variant === 'static') {
    return scope === 'premium' && mimeType === 'image/webp';
  }

  if (scope === 'base') {
    return (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp'
    );
  }

  return (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/gif'
  );
}

function validateCandidateOwnership(
  userId: string,
  group: ProfileMediaCandidateGroup,
  candidate: ProfileMediaCandidate,
) {
  const parts = candidate.quarantinePath.split('/');
  if (parts.length !== 6) {
    throw new ApiError(400, 'Некорректный путь приватного изображения.');
  }

  const [owner, pending, scope, kind, uploadId, fileName] = parts;
  if (
    owner !== userId ||
    pending !== 'pending' ||
    scope !== group.scope ||
    kind !== group.kind ||
    !UUID.test(uploadId)
  ) {
    throw new ApiError(400, 'Приватное изображение не принадлежит этому профилю.');
  }

  const fileMatch = fileName?.match(/^(original|static)\.(jpg|png|webp|gif)$/i);
  if (!fileMatch || fileMatch[1] !== candidate.variant) {
    throw new ApiError(400, 'Некорректный вариант приватного изображения.');
  }

  const extension = fileMatch[2].toLowerCase();
  const expectedPublic = group.scope === 'premium'
    ? `${userId}/premium/${group.kind}${candidate.variant === 'static' ? '-static' : ''}-${uploadId}.${extension}`
    : `${userId}/${group.kind}-${uploadId}.${extension}`;

  if (candidate.path !== expectedPublic) {
    throw new ApiError(400, 'Публичный путь изображения не соответствует приватной загрузке.');
  }
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
  const inspection = inspectProfileImageBytes(bytes);

  if (!inspection) {
    throw new ApiError(
      400,
      'Файл не является поддерживаемым JPG, PNG, WebP или GIF изображением.',
    );
  }

  const rawStorageMime = data.type?.trim().toLowerCase() || '';
  const storageMime = RECOGNIZED_STORAGE_MIMES.has(
    rawStorageMime as SupportedProfileImageMime,
  )
    ? rawStorageMime
    : null;

  return {
    candidate,
    bytes,
    storageMime,
    inspection,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function validateTechnicalMedia(
  group: ProfileMediaCandidateGroup,
  item: LoadedMedia,
) {
  if (item.size < 1 || item.size > maxAllowedBytes(group.scope, group.kind)) {
    throw new ApiError(413, 'Изображение превышает допустимый размер.');
  }

  const { inspection } = item;

  if (!allowedDetectedMime(group.scope, item.candidate.variant, inspection.mimeType)) {
    throw new ApiError(400, 'Этот формат изображения нельзя использовать в выбранном режиме.');
  }

  if (item.storageMime && item.storageMime !== inspection.mimeType) {
    throw new ApiError(
      400,
      'MIME загруженного файла не соответствует его реальному содержимому.',
    );
  }

  const pathExtension = item.candidate.path.split('.').pop()?.toLowerCase();
  if (pathExtension !== inspection.extension) {
    throw new ApiError(
      400,
      'Расширение изображения не соответствует его реальному формату.',
    );
  }

  const geometry = mediaGeometryLimit(
    group.scope,
    group.kind,
    item.candidate.variant,
  );

  const pixels = inspection.width * inspection.height;
  if (
    !Number.isSafeInteger(inspection.width) ||
    !Number.isSafeInteger(inspection.height) ||
    inspection.width < 1 ||
    inspection.height < 1 ||
    inspection.width > geometry.maxWidth ||
    inspection.height > geometry.maxHeight ||
    !Number.isSafeInteger(pixels) ||
    pixels > geometry.maxPixels
  ) {
    throw new ApiError(
      413,
      `Слишком большое разрешение изображения. Максимум ${geometry.maxWidth}×${geometry.maxHeight}px.`,
    );
  }

  if (
    inspection.animated &&
    (group.scope === 'base' || item.candidate.variant === 'static')
  ) {
    throw new ApiError(
      400,
      'Анимация разрешена только для оригинального Premium-медиа.',
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
    const seenPrivatePaths = new Set<string>();

    for (const group of groups) {
      if (!group.candidates.length) continue;

      for (const candidate of group.candidates) {
        validateCandidateOwnership(userId, group, candidate);

        if (seenPrivatePaths.has(candidate.quarantinePath)) {
          throw new ApiError(400, 'Одна приватная загрузка не может использоваться несколько раз.');
        }
        seenPrivatePaths.add(candidate.quarantinePath);
      }

      const items = await Promise.all(group.candidates.map(loadCandidate));
      for (const item of items) validateTechnicalMedia(group, item);

      for (const item of items) {
        const uploadBody = Uint8Array.from(item.bytes).buffer;
        const uploaded = await adminClient()
          .storage
          .from(PUBLIC_BUCKET)
          .upload(item.candidate.path, uploadBody, {
            contentType: item.inspection.mimeType,
            cacheControl: '31536000',
            upsert: false,
          });

        if (uploaded.error) {
          console.error('[ProfileMediaPublish] public upload failed:', {
            path: item.candidate.path,
            mimeType: item.inspection.mimeType,
            size: item.size,
            width: item.inspection.width,
            height: item.inspection.height,
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
          mime_type: item.inspection.mimeType,
          file_size: item.size,
          animated: item.inspection.animated,
          status: 'approved',
          reason: 'technical_checks_only',
          provider: 'disabled',
          provider_model: null,
          categories: {},
          category_scores: {},
          moderation_result: {
            ai_moderation_enabled: false,
            technical_checks_passed: true,
            detected_mime: item.inspection.mimeType,
            width: item.inspection.width,
            height: item.inspection.height,
            animated: item.inspection.animated,
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
