'use client';

import type { PremiumMediaTransform } from '@/lib/premium-studio';

export type ProfileMediaKind = 'avatar' | 'banner';

export const PROFILE_MEDIA_ASPECT: Record<ProfileMediaKind, number> = {
  avatar: 1,
  banner: 2.35,
};

const OUTPUTS: Record<ProfileMediaKind, {
  maxWidth: number;
  quality: number;
}> = {
  avatar: {
    maxWidth: 640,
    quality: 0.88,
  },
  banner: {
    maxWidth: 1800,
    quality: 0.9,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateProfileMediaCropRect(
  sourceWidth: number,
  sourceHeight: number,
  kind: ProfileMediaKind,
  transform: PremiumMediaTransform,
) {
  const aspect = PROFILE_MEDIA_ASPECT[kind];

  let baseWidth = sourceWidth;
  let baseHeight = sourceHeight;

  if (sourceWidth / sourceHeight > aspect) {
    baseWidth = sourceHeight * aspect;
  } else {
    baseHeight = sourceWidth / aspect;
  }

  const zoom = clamp(transform.zoom, 1, 3);
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  const focusX = sourceWidth * (clamp(transform.x, 0, 100) / 100);
  const focusY = sourceHeight * (clamp(transform.y, 0, 100) / 100);

  return {
    left: clamp(
      focusX - width / 2,
      0,
      Math.max(0, sourceWidth - width),
    ),
    top: clamp(
      focusY - height / 2,
      0,
      Math.max(0, sourceHeight - height),
    ),
    width,
    height,
  };
}

type DecodedMedia = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeWithImageBitmap(file: File): Promise<DecodedMedia | null> {
  if (typeof createImageBitmap !== 'function') return null;

  try {
    const bitmap = await createImageBitmap(file);

    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      return null;
    }

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function decodeWithImageElement(file: File): Promise<DecodedMedia> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('Браузер не смог декодировать выбранное изображение.'));
      image.src = url;
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('У изображения некорректный размер.');
    }

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decodeProfileMedia(file: File) {
  return (await decodeWithImageBitmap(file)) ?? decodeWithImageElement(file);
}

/**
 * Base avatar/banner are baked into WebP after cropping.
 * The same crop function is also used by the visual editor, so preview and
 * final output are pixel-equivalent instead of relying on CSS object-position.
 */
export async function prepareBaseProfileMedia(
  file: File,
  kind: ProfileMediaKind,
  transform: PremiumMediaTransform,
): Promise<File> {
  const decoded = await decodeProfileMedia(file);

  try {
    const crop = calculateProfileMediaCropRect(
      decoded.width,
      decoded.height,
      kind,
      transform,
    );

    const config = OUTPUTS[kind];
    const aspect = PROFILE_MEDIA_ASPECT[kind];

    // Never upscale a small source. Large phone photos are reduced locally.
    const outputWidth = Math.max(
      1,
      Math.min(config.maxWidth, Math.round(crop.width)),
    );
    const outputHeight = Math.max(
      1,
      Math.round(outputWidth / aspect),
    );

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Браузер не смог подготовить изображение.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      decoded.source,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (!value) {
            reject(new Error('Не удалось создать WEBP из выбранного изображения.'));
            return;
          }
          resolve(value);
        },
        'image/webp',
        config.quality,
      );
    });

    if (blob.type !== 'image/webp') {
      throw new Error('Этот браузер не поддерживает сохранение баннера в WEBP.');
    }

    return new File(
      [blob],
      `${kind}-${Date.now()}.webp`,
      {
        type: 'image/webp',
        lastModified: Date.now(),
      },
    );
  } finally {
    decoded.cleanup();
  }
}
