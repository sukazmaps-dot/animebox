'use client';

import { createClient } from '@/lib/supabase/client';

export type PendingProfileMediaUpload = {
  scope: 'base' | 'premium';
  kind: 'avatar' | 'banner';
  variant: 'original' | 'static';
  publicPath: string;
  quarantinePath: string;
};

type PrepareArgs = {
  scope: PendingProfileMediaUpload['scope'];
  kind: PendingProfileMediaUpload['kind'];
  variant: PendingProfileMediaUpload['variant'];
  body: Blob;
  mimeType?: string;
};

type PrepareResponse = {
  bucket?: string;
  quarantinePath?: string;
  publicPath?: string;
  token?: string;
  error?: string;
};

export async function uploadPrivateProfileMedia({
  scope,
  kind,
  variant,
  body,
  mimeType = body.type,
}: PrepareArgs): Promise<PendingProfileMediaUpload> {
  const response = await fetch('/api/profile/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope,
      kind,
      variant,
      mimeType,
      size: body.size,
    }),
  });
  const payload = (await response.json()) as PrepareResponse;

  if (
    !response.ok ||
    !payload.token ||
    !payload.quarantinePath ||
    !payload.publicPath
  ) {
    throw new Error(payload.error || 'Не удалось подготовить безопасную загрузку изображения.');
  }

  const supabase = createClient();
  const uploaded = await supabase.storage
    .from('profile-media-quarantine')
    .uploadToSignedUrl(payload.quarantinePath, payload.token, body, {
      cacheControl: '0',
      contentType: mimeType,
    });

  if (uploaded.error) throw uploaded.error;

  return {
    scope,
    kind,
    variant,
    publicPath: payload.publicPath,
    quarantinePath: payload.quarantinePath,
  };
}

export async function discardPrivateProfileMedia(
  uploads: PendingProfileMediaUpload[],
) {
  const quarantinePaths = [...new Set(uploads.map((item) => item.quarantinePath))];
  if (!quarantinePaths.length) return;

  try {
    await fetch('/api/profile/media/upload-url', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarantinePaths }),
      keepalive: true,
    });
  } catch {
    // Orphaned quarantine files are private and harmless; cleanup can retry later.
  }
}
