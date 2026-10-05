/** Normalize only public provider fields; never alter an AnimeBox ID. */
export function shikimoriPoster(value) {
  if (typeof value !== 'string' || !value || value.includes('/assets/globals/missing_')) return null;
  try {
    const url = new URL(value, 'https://shikimori.io');
    return url.protocol === 'https:' && /(^|\.)(shikimori\.(io|one)|shikimori\.me)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function normalizeShikimoriMetadata(row, fetchedAt = new Date().toISOString(), detail = false) {
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.name !== 'string') return null;
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const integer = (value, allowZero = false) => Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) ? value : null;
  const names = values => Array.isArray(values) ? [...new Set(values.flatMap(value => {
    const name = text(value?.russian) || text(value?.name);return name ? [name] : [];
  }))] : [];
  const date = typeof row.aired_on === 'string' && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(row.aired_on) ? row.aired_on : null;
  const month = date ? Number(date.slice(5,7)) : null;
  const score = typeof row.score === 'string' || typeof row.score === 'number' ? Number(row.score) : NaN;
  const description = text(row.description)?.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'')
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi,'').trim() || null;
  return {
    mal_id: row.id,title_ru:text(row.russian),title_romaji:text(row.name),description,
    poster_url:shikimoriPoster(row.image?.original),
    format:({tv:'TV',tv_13:'TV',tv_24:'TV',tv_48:'TV',movie:'MOVIE',ova:'OVA',ona:'ONA',special:'SPECIAL',tv_special:'SPECIAL',music:'MUSIC'})[row.kind] || null,
    status:['released','ongoing','anons','paused','discontinued'].includes(row.status) ? row.status : null,
    start_year:date && month >= 1 && month <= 12 ? Number(date.slice(0,4)) : null,
    start_month:month >= 1 && month <= 12 ? month : null,
    episodes:integer(row.episodes),episodes_aired:integer(row.episodes_aired,true),
    score:Number.isFinite(score) && score > 0 && score <= 10 ? score : null,
    genres:names(row.genres),studios:names(row.studios),fetched_at:fetchedAt,
    ...(detail ? {detail_fetched_at:fetchedAt} : {}),
  };
}
