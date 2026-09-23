'use client';

const MAX_SOURCE_SIZE = 16 * 1024 * 1024;
const MAX_EDITOR_DIMENSION = 4096;
const MAX_SOURCE_PIXELS = 80_000_000;
const MAX_SOURCE_EDGE = 20_000;

export type PickedImageKind =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'heic';

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function ascii(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

function extensionOf(file: File) {
  return file.name.split('.').pop()?.trim().toLowerCase() ?? '';
}

function hintedKind(file: File): PickedImageKind | null {
  const mime = file.type.trim().toLowerCase();
  const extension = extensionOf(file);

  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    extension === 'jpg' ||
    extension === 'jpeg'
  ) {
    return 'jpeg';
  }

  if (mime === 'image/png' || extension === 'png') return 'png';
  if (mime === 'image/webp' || extension === 'webp') return 'webp';
  if (mime === 'image/avif' || extension === 'avif') return 'avif';

  if (
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    mime === 'image/heic-sequence' ||
    mime === 'image/heif-sequence' ||
    extension === 'heic' ||
    extension === 'heif'
  ) {
    return 'heic';
  }

  return null;
}

export async function detectPickedImageKind(
  file: File,
): Promise<PickedImageKind> {
  const hint = hintedKind(file);

  try {
    const header = new Uint8Array(
      await file.slice(0, 64).arrayBuffer(),
    );

    if (
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff
    ) {
      return 'jpeg';
    }

    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return 'png';
    }

    if (
      ascii(header.slice(0, 4)) === 'RIFF' &&
      ascii(header.slice(8, 12)) === 'WEBP'
    ) {
      return 'webp';
    }

    if (ascii(header.slice(4, 8)) === 'ftyp') {
      const brands = ascii(header.slice(8));

      if (
        brands.includes('avif') ||
        brands.includes('avis')
      ) {
        return 'avif';
      }

      if (
        brands.includes('heic') ||
        brands.includes('heix') ||
        brands.includes('hevc') ||
        brands.includes('hevx') ||
        brands.includes('heim') ||
        brands.includes('heis')
      ) {
        return 'heic';
      }

      // mif1/msf1 are generic HEIF brands. Use the MIME/extension hint
      // to distinguish an AVIF file from an HEIC/HEIF file.
      if (
        brands.includes('mif1') ||
        brands.includes('msf1')
      ) {
        if (hint === 'avif') return 'avif';
        if (hint === 'heic') return 'heic';
      }
    }
  } catch {
    // Some Android content providers do not reliably expose a FileReader-like
    // byte stream. If the picker supplied a trustworthy MIME/extension hint,
    // native decoding can still succeed, so do not reject the file here.
  }

  if (hint) return hint;

  throw new Error(
    'Формат изображения не распознан. Используй JPG, PNG, WebP, AVIF, HEIC или HEIF.',
  );
}

async function decodeNative(
  blob: Blob,
): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });

      if (bitmap.width && bitmap.height) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        };
      }

      bitmap.close();
    } catch {
      // Fall through to the browser image decoder below.
    }
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            'Браузер не смог декодировать это изображение.',
          ),
        );
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

async function decodeHeic(
  file: File,
): Promise<DecodedImage> {
  let heic2any: typeof import('heic2any').default;

  try {
    ({ default: heic2any } = await import('heic2any'));
  } catch {
    throw new Error(
      'Не удалось загрузить HEIC-декодер. Попробуй ещё раз или выбери JPG/WebP.',
    );
  }

  let result: Blob | Blob[];

  try {
    result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.95,
    });
  } catch {
    throw new Error(
      'Не удалось декодировать HEIC/HEIF. Возможно, файл повреждён.',
    );
  }

  const converted = Array.isArray(result)
    ? result[0]
    : result;

  if (!(converted instanceof Blob)) {
    throw new Error('HEIC-декодер вернул некорректный результат.');
  }

  return decodeNative(converted);
}

async function decodePickedImage(
  file: File,
  kind: PickedImageKind,
) {
  if (kind === 'heic') {
    return decodeHeic(file);
  }

  // AVIF is decoded natively in current Chrome/Safari/Firefox. Once decoded,
  // it follows the exact same Canvas/WebP sanitation path as JPEG/PNG/WebP.
  try {
    return await decodeNative(file);
  } catch (error) {
    if (kind === 'avif') {
      throw new Error(
        'Этот браузер не смог декодировать AVIF. Обнови браузер или выбери JPG/WebP.',
      );
    }

    throw error;
  }
}

function scaledSize(
  width: number,
  height: number,
) {
  const longest = Math.max(width, height);

  if (longest <= MAX_EDITOR_DIMENSION) {
    return { width, height };
  }

  const ratio = MAX_EDITOR_DIMENSION / longest;

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              'Браузер не смог подготовить изображение.',
            ),
          );
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function redrawAndSanitize(
  decoded: DecodedImage,
): Promise<File> {
  if (
    decoded.width < 1 ||
    decoded.height < 1 ||
    decoded.width > MAX_SOURCE_EDGE ||
    decoded.height > MAX_SOURCE_EDGE ||
    decoded.width * decoded.height > MAX_SOURCE_PIXELS
  ) {
    throw new Error(
      'Разрешение изображения слишком большое для безопасной обработки.',
    );
  }

  const size = scaledSize(
    decoded.width,
    decoded.height,
  );

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d', {
    alpha: true,
  });

  if (!context) {
    throw new Error('Canvas недоступен в этом браузере.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(
    decoded.source,
    0,
    0,
    decoded.width,
    decoded.height,
    0,
    0,
    size.width,
    size.height,
  );

  // Redrawing the decoded pixels into a new Canvas intentionally drops the
  // original EXIF/IPTC/XMP/ICC metadata and malformed JPEG container chunks.
  let blob = await canvasToBlob(
    canvas,
    'image/webp',
    0.92,
  );
  let extension = 'webp';

  if (blob.type !== 'image/webp') {
    blob = await canvasToBlob(
      canvas,
      'image/jpeg',
      0.92,
    );
    extension = 'jpg';
  }

  canvas.width = 1;
  canvas.height = 1;

  return new File(
    [blob],
    `animebox-source-${Date.now()}.${extension}`,
    {
      type: blob.type,
      lastModified: Date.now(),
    },
  );
}

export async function normalizePickedImage(
  file: File,
): Promise<File> {
  if (!file || file.size < 1) {
    throw new Error('Выбранный файл пустой.');
  }

  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error(
      'Исходное изображение должно быть не больше 16 МБ.',
    );
  }

  const kind = await detectPickedImageKind(file);
  const decoded = await decodePickedImage(file, kind);

  try {
    return await redrawAndSanitize(decoded);
  } finally {
    decoded.cleanup();
  }
}
