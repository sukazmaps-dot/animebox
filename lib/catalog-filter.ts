const FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']);
const EXCLUDED_TAGS = new Set([
  'stop motion',
  'advertisement',
  'puppetry',
  'music video',
  'commercial',
  'promotional',
]);
const ALLOWED_ORIGIN = 'JP';

/** Catalog policy: series/films/specials, excluding music, ads and puppet animation. */
export function isCatalogAnime(media: {
  type?: string | null;
  format?: string | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean | null;
  tags?: Array<{ name?: string | null } | null> | null;
}): boolean {
  if (media.type !== 'ANIME' || !media.format || !FORMATS.has(media.format)) return false;
  if (media.countryOfOrigin !== ALLOWED_ORIGIN) return false;
  if (media.isAdult === true) return false;
  return !(media.tags ?? []).some((tag) => EXCLUDED_TAGS.has(tag?.name?.trim().toLowerCase() ?? ''));
}
