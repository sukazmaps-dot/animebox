import type { Anime } from '@/types/anime';
import {
  animeGenreAffinity,
  episodeLengthAffinity,
  normalizeTasteToken,
  type TasteGraph,
} from '@/lib/taste-graph';

export type SmartDiscoveryIntent = {
  original: string;
  normalized: string;
  isDiscovery: boolean;
  similarTo: string | null;
  includeGenres: string[];
  excludeTerms: string[];
  maxEpisodes: number | null;
  minEpisodes: number | null;
  minYear: number | null;
  completedOnly: boolean;
  movieOnly: boolean;
  preferShorter: boolean;
  preferLonger: boolean;
  freeText: string;
};

type GenreDefinition = {
  label: string;
  provider: string;
  aliases: string[];
};

const GENRES: GenreDefinition[] = [
  { label: 'Романтика', provider: 'Romance', aliases: ['романтика', 'романтическое', 'romance'] },
  { label: 'Экшен', provider: 'Action', aliases: ['экшен', 'боевик', 'action'] },
  { label: 'Комедия', provider: 'Comedy', aliases: ['комедия', 'смешное', 'comedy'] },
  { label: 'Драма', provider: 'Drama', aliases: ['драма', 'dramatic', 'drama'] },
  { label: 'Фэнтези', provider: 'Fantasy', aliases: ['фэнтези', 'fantasy'] },
  { label: 'Психологическое', provider: 'Psychological', aliases: ['психологическое', 'психологический', 'психологическая', 'психология', 'psychological'] },
  { label: 'Триллер', provider: 'Thriller', aliases: ['триллер', 'thriller'] },
  { label: 'Ужасы', provider: 'Horror', aliases: ['ужасы', 'хоррор', 'horror'] },
  { label: 'Детектив', provider: 'Mystery', aliases: ['детектив', 'тайна', 'mystery'] },
  { label: 'Повседневность', provider: 'Slice of Life', aliases: ['повседневность', 'slice of life', 'слайс оф лайф'] },
  { label: 'Фантастика', provider: 'Sci-Fi', aliases: ['фантастика', 'sci fi', 'sci-fi', 'sci fi'] },
  { label: 'Приключения', provider: 'Adventure', aliases: ['приключения', 'adventure'] },
  { label: 'Спорт', provider: 'Sports', aliases: ['спорт', 'sports'] },
  { label: 'Сверхъестественное', provider: 'Supernatural', aliases: ['сверхъестественное', 'supernatural'] },
  { label: 'Меха', provider: 'Mecha', aliases: ['меха', 'mecha'] },
  { label: 'Эччи', provider: 'Ecchi', aliases: ['эччи', 'ecchi'] },
];

const EXCLUSION_ALIASES: Array<{ term: string; aliases: string[] }> = [
  { term: 'harem', aliases: ['гарем', 'гарема', 'harem'] },
  { term: 'mecha', aliases: ['меха', 'mecha'] },
  { term: 'ecchi', aliases: ['эччи', 'ecchi'] },
  { term: 'school', aliases: ['школа', 'школьное', 'school'] },
  { term: 'isekai', aliases: ['исекай', 'исекая', 'исекаи', 'isekai'] },
  { term: 'romance', aliases: ['романтика', 'романтики', 'romance'] },
];

const GENRE_TOKEN_TO_PROVIDER = new Map<string, string>();
const GENRE_TOKEN_TO_LABEL = new Map<string, string>();
for (const genre of GENRES) {
  for (const value of [genre.label, genre.provider, ...genre.aliases]) {
    const token = normalizeTasteToken(value);
    GENRE_TOKEN_TO_PROVIDER.set(token, genre.provider);
    GENRE_TOKEN_TO_LABEL.set(token, genre.label);
  }
}

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalize(value: string) {
  return compact(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/[«»“”„]/g, '"')
      .replace(/[–—]/g, '-'),
  );
}

function extractSimilarTitle(normalized: string): string | null {
  const markers = [
    'похожее на ', 'похожий на ', 'похожая на ', 'похожие на ',
    'что-то похожее на ', 'что то похожее на ', 'что-нибудь похожее на ', 'что нибудь похожее на ',
    'что-то как ', 'что то как ', 'что-нибудь как ', 'что нибудь как ',
    'что посмотреть после ', 'после просмотра ',
    'similar to ', 'like ',
  ];

  // Prefer the longest marker so "что-то похожее на" is consumed as one phrase.
  markers.sort((left, right) => right.length - left.length);

  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index < 0) continue;

    let tail = normalized.slice(index + marker.length).trim();
    const delimiters = [
      ', но ', ' но ', ', без ', ' без ', ', до ', ' до ', ', от ', ' от ',
      ', короче', ' короче', ', длиннее', ' длиннее', ', после ', ' после ',
      ', который ', ' который ', ', чтобы ', ' чтобы ',
    ];
    let end = tail.length;
    for (const delimiter of delimiters) {
      const delimiterIndex = tail.indexOf(delimiter);
      if (delimiterIndex >= 0) end = Math.min(end, delimiterIndex);
    }

    tail = tail.slice(0, end).trim().replace(/^['"«]+|['"».,!?]+$/g, '');
    if (tail.length >= 2 && tail.length <= 120) return tail;
  }

  return null;
}

function extractEpisodeBound(normalized: string, kind: 'max' | 'min') {
  const patterns = kind === 'max'
    ? [
        /(?:до|не больше|максимум)\s+(\d{1,4})\s*(?:серий|серии|эпизодов|эпизода|episodes?)/iu,
        /(?:<=|≤)\s*(\d{1,4})\s*(?:серий|episodes?)?/iu,
      ]
    : [
        /(?:от|не меньше|минимум)\s+(\d{1,4})\s*(?:серий|серии|эпизодов|эпизода|episodes?)/iu,
        /(?:>=|≥)\s*(\d{1,4})\s*(?:серий|episodes?)?/iu,
      ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const number = Number(match?.[1]);
    if (Number.isSafeInteger(number) && number > 0 && number <= 5000) return number;
  }
  return null;
}

function extractMinYear(normalized: string) {
  const match = normalized.match(/(?:после|с|не старше|after|since)\s+(19\d{2}|20\d{2}|21\d{2})(?:\s*(?:года|год|г\.?))?/iu);
  const year = Number(match?.[1]);
  return Number.isSafeInteger(year) && year >= 1960 && year <= 2100 ? year : null;
}

function includesAlias(normalized: string, alias: string) {
  const target = normalizeTasteToken(alias);
  const haystack = ` ${normalizeTasteToken(normalized)} `;
  return haystack.includes(` ${target} `) || haystack.includes(` ${target}`) || haystack.includes(`${target} `);
}

function detectMoodGenres(normalized: string): string[] {
  const genres: string[] = [];
  if (/поплак|грустн|tearjerk|sad\b/iu.test(normalized)) genres.push('Драма');
  if (/спокойн|уютн|после учеб|после школы|relax|cozy/iu.test(normalized)) genres.push('Повседневность');
  if (/смешн|весел|посмеят|funny/iu.test(normalized)) genres.push('Комедия');
  return genres;
}

export function parseSmartDiscoveryQuery(raw: string): SmartDiscoveryIntent {
  const original = raw.trim();
  const normalized = normalize(original);
  const similarTo = extractSimilarTitle(normalized);
  const maxEpisodes = extractEpisodeBound(normalized, 'max');
  const minEpisodes = extractEpisodeBound(normalized, 'min');
  const minYear = extractMinYear(normalized);
  const preferShorter = /(?:^|[^\p{L}\p{N}_])(?:короче|короткое|короткий|короткая|shorter|short)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
  const preferLonger = /(?:^|[^\p{L}\p{N}_])(?:длиннее|длинное|длинный|longer|long)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
  const completedOnly = /(?:закончен\p{L}*|завершен\p{L}*|вышло полностью|finished|completed)/iu.test(normalized);
  const movieOnly = /(?:^|[^\p{L}\p{N}_])(?:фильм|полнометражк\p{L}*|movie)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);

  const includeGenres = [
    ...GENRES
      .filter(({ aliases }) => aliases.some((alias) => includesAlias(normalized, alias)))
      .map(({ label }) => label),
    ...detectMoodGenres(normalized),
  ];

  const excludeTerms = EXCLUSION_ALIASES
    .filter(({ aliases }) => aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:без|without|исключить)\\s+(?:[^,.;]{0,16}\\s)?${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(normalized);
    }))
    .map(({ term }) => term);

  const discoveryWords = /(?:^|[^\p{L}\p{N}_])(?:посоветуй|подбери|хочу|похож\p{L}*|без|до|короче|длиннее|что-нибудь|что нибудь|something|recommend|similar|после просмотра)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
  const isDiscovery = Boolean(
    similarTo || includeGenres.length || excludeTerms.length || maxEpisodes || minEpisodes || minYear ||
    preferShorter || preferLonger || completedOnly || movieOnly || discoveryWords,
  );

  let freeText = normalized;
  if (similarTo) freeText = freeText.replace(similarTo, ' ');
  freeText = compact(
    freeText
      .replace(/(^|[^\p{L}\p{N}_])(?:посоветуй|подбери|хочу|аниме|что-нибудь|что нибудь|something|recommend|similar|похожее|похожий|похожая|похожие|на|как|но|без|короче|длиннее|фильм)(?=$|[^\p{L}\p{N}_])/giu, '$1 ')
      .replace(/(?:до|от|не больше|не меньше|максимум|минимум)\s+\d{1,4}\s*(?:серий|серии|эпизодов|эпизода|episodes?)/giu, ' ')
      .replace(/(?:после|с|after|since)\s+(?:19\d{2}|20\d{2}|21\d{2})(?:\s*(?:года|год|г\.?))?/giu, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' '),
  );

  return {
    original,
    normalized,
    isDiscovery,
    similarTo,
    includeGenres: [...new Set(includeGenres)],
    excludeTerms: [...new Set(excludeTerms)],
    maxEpisodes,
    minEpisodes,
    minYear,
    completedOnly,
    movieOnly,
    preferShorter,
    preferLonger,
    freeText,
  };
}

export function discoveryGenreForProvider(value: string | null | undefined): string | null {
  if (!value) return null;
  return GENRE_TOKEN_TO_PROVIDER.get(normalizeTasteToken(value)) ?? value;
}

function canonicalGenre(value: string): string {
  const token = normalizeTasteToken(value);
  return GENRE_TOKEN_TO_PROVIDER.get(token) ?? token;
}

function normalizedTags(anime: Anime) {
  const tags = Array.isArray(anime.tags)
    ? anime.tags.map((tag: unknown) => {
        if (typeof tag === 'string') return normalizeTasteToken(tag);
        if (tag && typeof tag === 'object' && 'name' in tag && typeof (tag as { name?: unknown }).name === 'string') {
          return normalizeTasteToken((tag as { name: string }).name);
        }
        return '';
      }).filter(Boolean)
    : [];
  return new Set(tags);
}

function excludedByIntent(anime: Anime, intent: SmartDiscoveryIntent) {
  const genres = new Set((anime.genres ?? []).map(canonicalGenre));
  const tags = normalizedTags(anime);

  for (const term of intent.excludeTerms) {
    if (term === 'mecha' && genres.has('Mecha')) return true;
    if (term === 'ecchi' && genres.has('Ecchi')) return true;
    if (term === 'romance' && genres.has('Romance')) return true;
    if (term === 'harem' && [...tags].some((tag) => tag.includes('harem') || tag.includes('гарем'))) return true;
    if (term === 'school' && [...tags].some((tag) => tag.includes('school') || tag.includes('школ'))) return true;
    if (term === 'isekai' && [...tags].some((tag) => tag.includes('isekai') || tag.includes('исека'))) return true;
  }
  return false;
}

function textAffinity(anime: Anime, freeText: string) {
  if (!freeText) return 0;
  const tokens = normalizeTasteToken(freeText).split(' ').filter((token) => token.length >= 3);
  if (!tokens.length) return 0;
  const tags = [...normalizedTags(anime)];
  const haystack = normalizeTasteToken([
    anime.title?.russian,
    anime.russian,
    anime.title?.romaji,
    anime.title?.english,
    ...(anime.genres ?? []),
    ...tags,
  ].filter(Boolean).join(' '));
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length;
}

export function rankSmartDiscoveryCandidates(
  candidates: Anime[],
  intent: SmartDiscoveryIntent,
  options: {
    seed?: Anime | null;
    tasteGraph?: TasteGraph | null;
    strict?: boolean;
  } = {},
) {
  const strict = options.strict ?? true;
  const seedGenres = new Set((options.seed?.genres ?? []).map(canonicalGenre));
  const seedEpisodes = options.seed?.episodes ?? null;
  const requiredGenres = intent.includeGenres.map(canonicalGenre);

  return candidates
    .filter((anime) => !excludedByIntent(anime, intent))
    .filter((anime) => {
      const episodes = anime.episodes ?? null;
      if (intent.maxEpisodes && (episodes == null ? strict : episodes > intent.maxEpisodes)) return false;
      if (intent.minEpisodes && (episodes == null ? strict : episodes < intent.minEpisodes)) return false;
      if (strict && seedEpisodes && intent.preferShorter && (!episodes || episodes >= seedEpisodes)) return false;
      if (strict && seedEpisodes && intent.preferLonger && (!episodes || episodes <= seedEpisodes)) return false;
      if (intent.minYear && (anime.startDate?.year == null ? strict : anime.startDate.year < intent.minYear)) return false;
      if (intent.completedOnly && String(anime.status ?? '').toUpperCase() !== 'FINISHED') return false;
      if (intent.movieOnly && String(anime.format ?? '').toUpperCase() !== 'MOVIE') return false;
      if (strict && requiredGenres.length) {
        const genres = new Set((anime.genres ?? []).map(canonicalGenre));
        if (!requiredGenres.some((genre) => genres.has(genre))) return false;
      }
      return true;
    })
    .map((anime, index) => {
      const genres = new Set((anime.genres ?? []).map(canonicalGenre));
      const includedHits = requiredGenres.filter((genre) => genres.has(genre)).length;
      const seedHits = [...seedGenres].filter((genre) => genres.has(genre)).length;
      const seedSimilarity = seedGenres.size ? seedHits / seedGenres.size : 0;
      const taste = animeGenreAffinity(anime, options.tasteGraph);
      const lengthAffinity = episodeLengthAffinity(anime, options.tasteGraph);
      const freeTextAffinity = textAffinity(anime, intent.freeText);
      let lengthIntent = 0;

      if (seedEpisodes && anime.episodes) {
        if (intent.preferShorter && anime.episodes < seedEpisodes) {
          lengthIntent = Math.min(1, (seedEpisodes - anime.episodes) / Math.max(12, seedEpisodes));
        }
        if (intent.preferLonger && anime.episodes > seedEpisodes) {
          lengthIntent = Math.min(1, (anime.episodes - seedEpisodes) / Math.max(12, seedEpisodes));
        }
      }

      const score =
        includedHits * 1.2 +
        seedSimilarity * 1.45 +
        taste.positive * 0.72 -
        taste.negative * 0.95 +
        lengthAffinity * 0.18 +
        lengthIntent * 0.7 +
        freeTextAffinity * 0.35 +
        Math.max(0, 0.18 - index * 0.002);

      return { anime, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ anime }) => anime);
}

export function describeSmartDiscoveryIntent(intent: SmartDiscoveryIntent): string[] {
  const parts: string[] = [];
  if (intent.similarTo) parts.push(`похоже на «${intent.similarTo}»`);
  if (intent.includeGenres.length) parts.push(intent.includeGenres.join(' · '));
  if (intent.maxEpisodes) parts.push(`до ${intent.maxEpisodes} серий`);
  if (intent.minEpisodes) parts.push(`от ${intent.minEpisodes} серий`);
  if (intent.preferShorter) parts.push('короче оригинала');
  if (intent.preferLonger) parts.push('длиннее оригинала');
  if (intent.minYear) parts.push(`после ${intent.minYear}`);
  if (intent.completedOnly) parts.push('завершённые');
  if (intent.movieOnly) parts.push('фильмы');
  if (intent.excludeTerms.length) {
    const labels: Record<string, string> = {
      harem: 'гарема', mecha: 'меха', ecchi: 'эччи', school: 'школы', isekai: 'исекая', romance: 'романтики',
    };
    parts.push(`без ${intent.excludeTerms.map((term) => labels[term] ?? term).join(', ')}`);
  }
  return parts;
}

export function discoveryConstraintChips(intent: SmartDiscoveryIntent) {
  const chips: Array<{ id: string; label: string }> = [];
  if (intent.similarTo) chips.push({ id: 'similar', label: `Похоже на: ${intent.similarTo}` });
  for (const genre of intent.includeGenres) chips.push({ id: `genre:${genre}`, label: genre });
  if (intent.preferShorter) chips.push({ id: 'shorter', label: 'Короче' });
  if (intent.preferLonger) chips.push({ id: 'longer', label: 'Длиннее' });
  if (intent.maxEpisodes) chips.push({ id: 'maxEpisodes', label: `До ${intent.maxEpisodes} серий` });
  if (intent.minEpisodes) chips.push({ id: 'minEpisodes', label: `От ${intent.minEpisodes} серий` });
  if (intent.minYear) chips.push({ id: 'minYear', label: `После ${intent.minYear}` });
  if (intent.completedOnly) chips.push({ id: 'completed', label: 'Завершённые' });
  if (intent.movieOnly) chips.push({ id: 'movie', label: 'Фильмы' });
  for (const term of intent.excludeTerms) chips.push({ id: `exclude:${term}`, label: `Без ${term}` });
  return chips;
}

export function removeDiscoveryConstraint(raw: string, chipId: string) {
  let next = raw;
  if (chipId === 'shorter') next = next.replace(/(?:короче|короткое|короткий|короткая|shorter|short)/giu, ' ');
  if (chipId === 'longer') next = next.replace(/(?:длиннее|длинное|длинный|longer|long)/giu, ' ');
  if (chipId === 'maxEpisodes') next = next.replace(/(?:до|не больше|максимум|<=|≤)\s*\d{1,4}\s*(?:серий|серии|эпизодов|эпизода|episodes?)?/giu, ' ');
  if (chipId === 'minEpisodes') next = next.replace(/(?:от|не меньше|минимум|>=|≥)\s*\d{1,4}\s*(?:серий|серии|эпизодов|эпизода|episodes?)?/giu, ' ');
  if (chipId === 'minYear') next = next.replace(/(?:после|с|after|since)\s+(?:19\d{2}|20\d{2}|21\d{2})(?:\s*(?:года|год|г\.?))?/giu, ' ');
  if (chipId === 'completed') next = next.replace(/(?:закончен\p{L}*|завершен\p{L}*|вышло полностью|finished|completed)/giu, ' ');
  if (chipId === 'movie') next = next.replace(/(?:фильм|полнометражк\p{L}*|movie)/giu, ' ');

  if (chipId.startsWith('exclude:')) {
    const term = chipId.slice('exclude:'.length);
    const definition = EXCLUSION_ALIASES.find((item) => item.term === term);
    for (const alias of definition?.aliases ?? []) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = next.replace(new RegExp(`(?:без|without|исключить)\\s+(?:[^,.;]{0,16}\\s)?${escaped}`, 'giu'), ' ');
    }
  }

  if (chipId.startsWith('genre:')) {
    const label = chipId.slice('genre:'.length);
    const definition = GENRES.find((item) => item.label === label);
    for (const alias of definition?.aliases ?? []) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = next.replace(new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'giu'), ' ');
    }
  }

  return compact(
    next
      .replace(/\s+,/g, ',')
      .replace(/,{2,}/g, ',')
      .replace(/(?:,\s*)?(?:но|and|but)\s*$/giu, ' ')
      .replace(/^\s*,|,\s*$/g, ''),
  );
}

export function smartDiscoveryMatch(
  anime: Anime,
  intent: SmartDiscoveryIntent,
  options: {
    seed?: Pick<Anime, 'genres' | 'episodes'> | null;
    tasteGraph?: TasteGraph | null;
  } = {},
) {
  const reasons: string[] = [];
  const genres = new Set((anime.genres ?? []).map(canonicalGenre));
  const requestedGenres = intent.includeGenres.map(canonicalGenre);
  const genreHits = requestedGenres.filter((genre) => genres.has(genre)).length;
  const seedGenres = new Set((options.seed?.genres ?? []).map(canonicalGenre));
  const seedHits = [...seedGenres].filter((genre) => genres.has(genre)).length;
  const seedSimilarity = seedGenres.size ? seedHits / seedGenres.size : 0;
  const taste = animeGenreAffinity(anime, options.tasteGraph);

  let score = 52;
  score += Math.min(16, seedSimilarity * 18);
  score += Math.min(12, genreHits * 6);
  score += Math.min(12, taste.positive * 14);

  if (options.seed?.episodes && anime.episodes) {
    if (intent.preferShorter && anime.episodes < options.seed.episodes) {
      score += 7;
      reasons.push('короче оригинала');
    }
    if (intent.preferLonger && anime.episodes > options.seed.episodes) {
      score += 7;
      reasons.push('длиннее оригинала');
    }
  }

  if (seedSimilarity >= 0.35) reasons.unshift('похожие жанры');
  if (genreHits > 0) reasons.push(`подходит по жанру: ${intent.includeGenres[0]}`);
  if (taste.positive >= 0.25) reasons.push('совпадает с твоим Taste Graph');
  if (intent.maxEpisodes && anime.episodes && anime.episodes <= intent.maxEpisodes) reasons.push(`до ${intent.maxEpisodes} серий`);
  if (intent.minYear && anime.startDate?.year && anime.startDate.year >= intent.minYear) reasons.push(`после ${intent.minYear}`);

  return {
    percent: Math.round(Math.min(97, Math.max(55, score))),
    reasons: [...new Set(reasons)].slice(0, 2),
  };
}
