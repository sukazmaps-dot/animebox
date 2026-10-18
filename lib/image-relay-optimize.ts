import sharp from 'sharp';
import { createBoundedWork } from '@/lib/bounded-work';
import { createPublicResultCache } from '@/lib/public-result-cache';

type RelayImage = { bytes: Uint8Array; contentType: string };
const work = createBoundedWork(1, 2);
const cache = createPublicResultCache<RelayImage>({
  ttlMs: 10 * 60_000, maxEntries: 32, maxBytes: 2 * 1024 * 1024,
  sizeOf: image => image.bytes.byteLength,
  cacheWhen: image => image.bytes.byteLength <= 512 * 1024,
});

/** One source-level derivative, not a separate encode for every DPR/width. */
export async function optimizeRelayImage(key: string, original: RelayImage, signal: AbortSignal): Promise<RelayImage> {
  if (!/^image\/(jpeg|png|webp|avif|gif)(?:;|$)/i.test(original.contentType)) return original;
  try {
    return await cache(key, loadSignal => work.run(
      AbortSignal.any([loadSignal, AbortSignal.timeout(2500)]), async () => {
        const image = sharp(original.bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
        const abort = () => { image.destroy(); };
        loadSignal.addEventListener('abort', abort, { once: true });
        try {
          const metadata = await image.metadata();
          // Do not flatten animated posters or enlarge small provider images.
          if ((metadata.pages ?? 1) > 1) return original;
          const bytes = await image.rotate()
            .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 70, effort: 2 }).timeout({ seconds: 2 }).toBuffer();
          loadSignal.throwIfAborted();
          return bytes.byteLength < original.bytes.byteLength
            ? { bytes, contentType: 'image/webp' } : original;
        } finally {
          loadSignal.removeEventListener('abort', abort);
          image.destroy();
        }
      }), signal);
  } catch {
    signal.throwIfAborted();
    // Busy queue, unsupported decode and timeouts must not lose a valid poster.
    return original;
  }
}
