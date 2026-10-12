import type { AnimeImage } from '@/types/anime';
import { normalizeImageUrl } from '@/lib/image-service';

/** Keep independent provider artwork when the saved catalog URL is stale. */
export function schedulePosterImage(...values: Array<string | null | undefined>): AnimeImage | null {
  const sources = [...new Set(values.map(normalizeImageUrl).filter((url): url is string =>
    Boolean(url && !url.includes('/assets/globals/missing_') && !url.startsWith('/brand/')),
  ))];
  if (!sources.length) return null;
  return { large: sources[0], extraLarge: sources[1] ?? sources[0] };
}
