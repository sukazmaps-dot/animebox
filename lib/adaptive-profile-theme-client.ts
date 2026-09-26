'use client';

import { resolveReadableTextColor } from '@/lib/premium-studio';

export type AdaptiveProfilePalette = {
  primaryColor: string;
  accentColor: string;
  textColor: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsv(r: number, g: number, b: number) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
    else if (max === ng) h = 60 * ((nb - nr) / delta + 2);
    else h = 60 * ((nr - ng) / delta + 4);
  }

  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToHex(h: number, s: number, v: number) {
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const chroma = val * sat;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function deriveAdaptiveProfilePalette(
  url: string,
): Promise<AdaptiveProfilePalette> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Не удалось прочитать изображение для подбора палитры.');
  }

  const blob = await response.blob();
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(blob);

    const maxSample = 48;
    const sampleScale = Math.min(
      1,
      maxSample / bitmap.width,
      maxSample / bitmap.height,
    );
    const width = Math.max(1, Math.round(bitmap.width * sampleScale));
    const height = Math.max(1, Math.round(bitmap.height * sampleScale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas недоступен.');

    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    const buckets = new Map<
      string,
      { count: number; r: number; g: number; b: number }
    >();

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 140) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const hsv = rgbToHsv(r, g, b);

      if (hsv.v < 10) continue;
      if (hsv.v > 96 && hsv.s < 8) continue;

      const key = [r, g, b]
        .map((channel) => String(Math.round(channel / 24) * 24))
        .join('-');

      const bucket = buckets.get(key) ?? {
        count: 0,
        r: 0,
        g: 0,
        b: 0,
      };

      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }

    const candidates = [...buckets.values()]
      .map((bucket) => {
        const count = Math.max(1, bucket.count);
        const r = Math.round(bucket.r / count);
        const g = Math.round(bucket.g / count);
        const b = Math.round(bucket.b / count);
        return {
          count,
          r,
          g,
          b,
          hsv: rgbToHsv(r, g, b),
        };
      })
      .filter((candidate) => candidate.hsv.v >= 12);

    if (!candidates.length) {
      return {
        primaryColor: '#111827',
        accentColor: '#8B5CF6',
        textColor: '#F7F3FF',
      };
    }

    const dominant = [...candidates].sort((a, b) => {
      const aScore = a.count * (a.hsv.s >= 18 ? 1.22 : 0.92);
      const bScore = b.count * (b.hsv.s >= 18 ? 1.22 : 0.92);
      return bScore - aScore;
    })[0];

    const accent = [...candidates].sort((a, b) => {
      const aScore =
        a.count * 0.55 +
        a.hsv.s * 1.75 +
        a.hsv.v * 0.35;
      const bScore =
        b.count * 0.55 +
        b.hsv.s * 1.75 +
        b.hsv.v * 0.35;
      return bScore - aScore;
    })[0] ?? dominant;

    const primaryColor = hsvToHex(
      dominant.hsv.h,
      clamp(dominant.hsv.s * 0.45 + 10, 14, 42),
      clamp(dominant.hsv.v * 0.18 + 6, 8, 22),
    );

    const accentColor = hsvToHex(
      accent.hsv.h,
      clamp(Math.max(accent.hsv.s, 54), 54, 90),
      clamp(Math.max(accent.hsv.v, 62), 62, 92),
    );

    return {
      primaryColor,
      accentColor,
      textColor: resolveReadableTextColor('#F7F3FF', primaryColor),
    };
  } finally {
    bitmap?.close();
  }
}
