export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function episodeOrdinal(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const n = Number(value.ordinal ?? value.episode ?? value.number);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function pageItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ['data', 'items', 'episodes', 'releases', 'list']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function episodePageItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    if (value.some((item) => episodeOrdinal(item) === null)) {
      throw new Error('Invalid provider episode entry');
    }
    return value;
  }
  if (!isRecord(value)) throw new Error('Invalid provider episode page');
  for (const key of ['data', 'items', 'episodes', 'list']) {
    if (key in value) return episodePageItems(value[key]);
  }
  // Some releases expose an ordinal-keyed dictionary rather than an array.
  return Object.entries(value).map(([key, item]) => {
    if (!isRecord(item)) throw new Error('Invalid provider episode entry');
    if (episodeOrdinal(item) !== null) return item;
    const ordinal = Number(key.replace(/^ep/, ''));
    if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
      throw new Error('Invalid provider episode dictionary');
    }
    return { ...item, ordinal };
  });
}
/** Follow the provider's pagination contract, not an invented limit=99999. */
export async function collectEpisodePages(
  initial: unknown,
  endpoint: string,
  fetchPage: (url: string) => Promise<unknown>,
): Promise<unknown[]> {
  const result = new Map<number, unknown>();
  const seen = new Set<string>([endpoint]);
  let page = initial;
  let currentUrl = endpoint;
  while (true) {
    for (const item of episodePageItems(page)) {
      const ordinal = episodeOrdinal(item);
      if (ordinal !== null) result.set(ordinal, item);
    }
    const links = isRecord(page) && isRecord(page.links) ? page.links : {};
    const meta = isRecord(page) && isRecord(page.meta) ? page.meta : {};
    const next = links.next ?? (isRecord(page) ? page.next_page_url : null);
    if (!next) {
      if (Number(meta.current_page) < Number(meta.last_page) || meta.has_more === true) {
        throw new Error('Provider returned a partial episode list without a continuation URL');
      }
      break;
    }
    if (typeof next !== 'string') throw new Error('Invalid episode pagination URL');
    const url = new URL(next, currentUrl);
    const base = new URL(endpoint);
    if (url.origin !== base.origin || !url.pathname.startsWith('/api/v1/') || url.username || url.password) {
      throw new Error('Invalid episode pagination origin');
    }
    if (seen.has(url.href)) throw new Error('Repeated episode pagination cursor');
    seen.add(url.href);
    currentUrl = url.href;
    page = await fetchPage(currentUrl);
  }
  return [...result.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
}
export function exactReleaseTitle(release: unknown, titles: string[]): boolean {
  if (!isRecord(release)) return false;
  // Punctuation is meaningful: Gintama, Gintama' and Gintama. are different releases.
  const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const values: unknown[] = [];
  for (const field of ['title', 'name', 'names', 'russian', 'english', 'romaji', 'native', 'main']) {
    const value = release[field];
    if (typeof value === 'string') values.push(value);
    if (isRecord(value)) values.push(...Object.values(value));
  }
  const accepted = new Set(titles.map(normalize).filter(Boolean));
  return values.some(value => typeof value === 'string' && accepted.has(normalize(value)));
}
