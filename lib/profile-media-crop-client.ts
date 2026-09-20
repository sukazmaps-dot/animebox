'use client';

import type { PremiumMediaTransform } from '@/lib/premium-studio';

type ProfileMediaKind = 'avatar' | 'banner';

const OUTPUTS: Record<ProfileMediaKind, {
  aspect: number;
  maxWidth: number;
  quality: number;
}> = {
  avatar: {
    aspect: 1,
    maxWidth: 640,
    quality: 0.86,
  },
  banner: {
    aspect: 5,
    maxWidth: 1800,
    quality: 0.82,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cropRect(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
  transform: PremiumMediaTransform,
) {
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
    left: clamp(focusX - width / 2, 0, Math.max(0, sourceWidth - width)),
    top: clamp(focusY - height / 2, 0, Math.max(0, sourceHeight - height)),
    width,
    height,
  };
}

/**
 * Base profile media is intentionally baked into a compact WEBP instead of
 * storing another set of crop coordinates. That keeps the same avatar framing
 * in comments, menus and profiles while making the upload dramatically smaller.
 */
export async function prepareBaseProfileMedia(
  file: File,
  kind: ProfileMediaKind,
  transform: PremiumMediaTransform,
): Promise<File> {
  const bitmap = await createImageBitmap(file);

  try {
    const config = OUTPUTS[kind];
    const crop = cropRect(
      bitmap.width,
      bitmap.height,
      config.aspect,
      transform,
    );

    const outputWidth = Math.max(
      1,
      Math.min(config.maxWidth, Math.round(crop.width)),
    );
    const outputHeight = Math.max(
      1,
      Math.round(outputWidth / config.aspect),
    );

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Браузер не смог подготовить изображение.');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
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
            reject(new Error('Не удалось оптимизировать изображение.'));
            return;
          }
          resolve(value);
        },
        'image/webp',
        config.quality,
      );
    });

    return new File(
      [blob],
      `${kind}-${Date.now()}.webp`,
      {
        type: 'image/webp',
        lastModified: Date.now(),
      },
    );
  } finally {
    bitmap.close();
  }
}
