'use client';

import type { PremiumMediaTransform } from '@/lib/premium-studio';

export type ProfileMediaKind = 'avatar' | 'banner';

export const PROFILE_MEDIA_ASPECT: Record<ProfileMediaKind, number> = {
  avatar: 1,
  banner: 3,
};

const OUTPUTS: Record<ProfileMediaKind, {
  maxWidth: number;
  quality: number;
}> = {
  avatar: {
    maxWidth: 256,
    quality: 0.88,
  },
  banner: {
    maxWidth: 960,
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
  premium = false,
): Promise<File> {
  const decoded = await decodeProfileMedia(file);
  const canvas = document.createElement('canvas');

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
      Math.min(kind === 'avatar' && premium ? 512 : config.maxWidth, Math.round(crop.width)),
    );
    const outputHeight = Math.max(
      1,
      Math.round(outputWidth / aspect),
    );

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

    const encode = (type: string, quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (!value) {
            reject(new Error('Не удалось создать WEBP из выбранного изображения.'));
            return;
          }
          resolve(value);
        },
        type,
        quality,
      );
    });

    let blob = await encode('image/webp', config.quality);
    let mime = 'image/webp';
    if (blob.type !== mime) {
      // Flatten transparency intentionally for the JPEG fallback.
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#202028';
      context.fillRect(0, 0, canvas.width, canvas.height);
      mime = 'image/jpeg';
      blob = await encode(mime, config.quality);
    }
    const budget = kind === 'avatar' ? 200 * 1024 : 300 * 1024;
    for (const quality of [.76, .64, .52, .4]) {
      if (blob.size <= budget) break;
      blob = await encode(mime, quality);
    }
    canvas.width = canvas.height = 1;
    if (blob.type !== mime || blob.size > budget) {
      throw new Error('Не удалось уменьшить изображение до допустимого размера. Выбери другой кадр.');
    }

    return new File(
      [blob],
      `${kind}-${Date.now()}.${mime === 'image/webp' ? 'webp' : 'jpg'}`,
      {
        type: mime,
        lastModified: Date.now(),
      },
    );
  } finally {
    canvas.width = canvas.height = 1;
    decoded.cleanup();
  }
}

export const compressImage = prepareBaseProfileMedia;

export async function extractDominantColor(file: File): Promise<string> {
  const decoded = await decodeProfileMedia(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '#70618c';
    context.drawImage(decoded.source, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
      buckets.set(key, bucket);
    }
    const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
    return dominant ? '#' + [dominant.r, dominant.g, dominant.b]
      .map(value => Math.round(value / dominant.count).toString(16).padStart(2, '0')).join('') : '#70618c';
  } finally {
    decoded.cleanup();
    canvas.width = canvas.height = 1;
  }
}
