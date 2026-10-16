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


const SIGNED_URL_TIMEOUT_MS = 10_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 60_000;

export async function profileMediaFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Сервер слишком долго отвечает. Попробуйте ещё раз.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function withUploadTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error('Загрузка изображения заняла слишком много времени. Проверьте соединение и повторите попытку.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

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
  const response = await profileMediaFetchWithTimeout('/api/profile/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope,
      kind,
      variant,
      mimeType,
      size: body.size,
    }),
  }, SIGNED_URL_TIMEOUT_MS);
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
  const uploaded = await withUploadTimeout(
    supabase.storage
      .from('profile-media-quarantine')
      .uploadToSignedUrl(payload.quarantinePath, payload.token, body, {
        cacheControl: '0',
        contentType: mimeType,
      }),
    STORAGE_UPLOAD_TIMEOUT_MS,
  );

  if (uploaded.error) {
    const error = uploaded.error as {name?: string; message?: string; statusCode?: string};
    console.warn('[ProfileMedia] upload failed', {
      stage: 'storage-upload', code: error.statusCode ?? error.name,
      type: mimeType, bytes: body.size, kind, scope,
    });
    throw new Error(error.statusCode === '413'
      ? 'Storage отклонил размер изображения. Попробуй уменьшить файл.'
      : error.statusCode === '403'
        ? 'Нет доступа к загрузке. Обнови страницу и войди в аккаунт заново.'
        : `Не удалось загрузить изображение${error.statusCode ? ` (код ${error.statusCode})` : ''}. Попробуй ещё раз.`);
  }

  return {
    scope,
    kind,
    variant,
    publicPath: payload.publicPath,
    quarantinePath: payload.quarantinePath,
  };
}

export function uploadAvatar(args: Omit<PrepareArgs, 'kind'>) {
  return uploadPrivateProfileMedia({...args, kind:'avatar'});
}

export function uploadBanner(args: Omit<PrepareArgs, 'kind'>) {
  // Premium is rechecked by the signed-upload API and at profile commit.
  return uploadPrivateProfileMedia({...args, kind:'banner'});
}

export async function setBannerColor(color: string, mode: 'auto' | 'manual' = 'manual') {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !['auto','manual'].includes(mode)) {
    throw new Error('Цвет должен быть в формате #RRGGBB.');
  }
  const supabase = createClient();
  const {data:{user}, error:authError} = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Войди в аккаунт, чтобы сохранить цвет.');
  const {data,error} = await supabase.from('profiles')
    .update({banner_color:color.toLowerCase(),banner_color_mode:mode})
    .eq('id',user.id).select('banner_color,banner_color_mode').single();
  if (error) throw new Error('Не удалось сохранить цвет баннера.');
  return data;
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
