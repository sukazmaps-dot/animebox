import type { Anime } from '@/types/anime';
import { normalizeTasteToken, type TasteGraph, animeGenreAffinity, episodeLengthAffinity } from '@/lib/taste-graph';

export type SmartDiscoveryIntent = {
  original: string;
  normalized: string;
  isDiscovery: boolean;
  similarTo: string | null;
  includeGenres: string[];
  excludeTerms: string[];
  maxEpisodes: number | null;
  minEpisodes: number | null;
  preferShorter: boolean;
  preferLonger: boolean;
  freeText: string;
};

const GENRE_ALIASES: Array<{ genre: string; aliases: string[] }> = [
  { genre: 'Романтика', aliases: ['романтика', 'романтическое', 'romance'] },
  { genre: 'Экшен', aliases: ['экшен', 'боевик', 'action'] },
  { genre: 'Комедия', aliases: ['комедия', 'смешное', 'comedy'] },
  { genre: 'Драма', aliases: ['драма', 'dramatic', 'drama'] },
  { genre: 'Фэнтези', aliases: ['фэнтези', 'fantasy'] },
  { genre: 'Психологическое', aliases: ['психологическое', 'психология', 'psychological'] },
  { genre: 'Триллер', aliases: ['триллер', 'thriller'] },
  { genre: 'Ужасы', aliases: ['ужасы', 'хоррор', 'horror'] },
  { genre: 'Детектив', aliases: ['детектив', 'тайна', 'mystery'] },
  { genre: 'Повседневность', aliases: ['повседневность', 'slice of life', 'слайс оф лайф'] },
  { genre: 'Фантастика', aliases: ['фантастика', 'sci fi', 'sci-fi'] },
  { genre: 'Приключения', aliases: ['приключения', 'adventure'] },
  { genre: 'Спорт', aliases: ['спорт', 'sports'] },
  { genre: 'Сверхъестественное', aliases: ['сверхъестественное', 'supernatural'] },
  { genre: 'Меха', aliases: ['меха', 'mecha'] },
  { genre: 'Эччи', aliases: ['эччи', 'ecchi'] },
];

const EXCLUSION_ALIASES: Array<{ term: string; aliases: string[] }> = [
  { term: 'harem', aliases: ['гарем', 'гарема', 'harem'] },
  { term: 'mecha', aliases: ['меха', 'mecha'] },
  { term: 'ecchi', aliases: ['эччи', 'ecchi'] },
  { term: 'school', aliases: ['школа', 'школьное', 'school'] },
];

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
    'что-то как ', 'что то как ', 'что-нибудь как ', 'что нибудь как ',
    'similar to ',
  ];

  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index < 0) continue;

    let tail = normalized.slice(index + marker.length).trim();
    const delimiters = [', но ', ' но ', ', без ', ' без ', ', до ', ' до ', ', короче', ' короче', ', длиннее', ' длиннее'];
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

function includesAlias(normalized: string, alias: string) {
  const target = normalizeTasteToken(alias);
  const haystack = ` ${normalizeTasteToken(normalized)} `;
  return haystack.includes(` ${target} `) || haystack.includes(` ${target}`) || haystack.includes(`${target} `);
}

export function parseSmartDiscoveryQuery(raw: string): SmartDiscoveryIntent {
  const original = raw.trim();
  const normalized = normalize(original);
  const similarTo = extractSimilarTitle(normalized);
  const maxEpisodes = extractEpisodeBound(normalized, 'max');
  const minEpisodes = extractEpisodeBound(normalized, 'min');
  const preferShorter = /(?:^|[^\p{L}\p{N}_])(?:короче|короткое|короткий|короткая|shorter|short)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
  const preferLonger = /(?:^|[^\p{L}\p{N}_])(?:длиннее|длинное|длинный|longer|long)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);

  const includeGenres = GENRE_ALIASES
    .filter(({ aliases }) => aliases.some((alias) => includesAlias(normalized, alias)))
    .map(({ genre }) => genre);

  const excludeTerms = EXCLUSION_ALIASES
    .filter(({ aliases }) => aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:без|without|исключить)\\s+(?:[^,.;]{0,16}\\s)?${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(normalized);
    }))
    .map(({ term }) => term);

  const discoveryWords = /(?:^|[^\p{L}\p{N}_])(?:посоветуй|подбери|хочу|похож\p{L}*|без|до|короче|длиннее|что-нибудь|что нибудь|something|recommend|similar)(?=$|[^\p{L}\p{N}_])/iu.test(normalized);
  const isDiscovery = Boolean(
    similarTo || includeGenres.length || excludeTerms.length || maxEpisodes || minEpisodes || preferShorter || preferLonger || discoveryWords,
  );

  let freeText = normalized;
  if (similarTo) {
    freeText = freeText.replace(similarTo, ' ');
  }
  freeText = compact(
    freeText
      .replace(/(^|[^\p{L}\p{N}_])(?:посоветуй|подбери|хочу|аниме|что-нибудь|что нибудь|something|recommend|similar|похожее|похожий|похожая|похожие|на|как|но|без|короче|длиннее)(?=$|[^\p{L}\p{N}_])/giu, '$1 ')
      .replace(/(?:до|от|не больше|не меньше|максимум|минимум)\s+\d{1,4}\s*(?:серий|серии|эпизодов|эпизода|episodes?)/giu, ' ')
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
    preferShorter,
    preferLonger,
    freeText,
  };
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
  const genres = new Set((anime.genres ?? []).map(normalizeTasteToken));
  const tags = normalizedTags(anime);

  for (const term of intent.excludeTerms) {
    if (term === 'mecha' && genres.has('меха')) return true;
    if (term === 'ecchi' && genres.has('эччи')) return true;
    if (term === 'harem' && [...tags].some((tag) => tag.includes('harem') || tag.includes('гарем'))) return true;
    if (term === 'school' && [...tags].some((tag) => tag.includes('school') || tag.includes('школ'))) return true;
  }
  return false;
}

export function rankSmartDiscoveryCandidates(
  candidates: Anime[],
  intent: SmartDiscoveryIntent,
  options: { seed?: Anime | null; tasteGraph?: TasteGraph | null } = {},
) {
  const seedGenres = new Set((options.seed?.genres ?? []).map(normalizeTasteToken));
  const seedEpisodes = options.seed?.episodes ?? null;
  const requiredGenres = intent.includeGenres.map(normalizeTasteToken);

  return candidates
    .filter((anime) => !excludedByIntent(anime, intent))
    .filter((anime) => {
      if (intent.maxEpisodes && anime.episodes && anime.episodes > intent.maxEpisodes) return false;
      if (intent.minEpisodes && anime.episodes && anime.episodes < intent.minEpisodes) return false;
      return true;
    })
    .map((anime, index) => {
      const genres = new Set((anime.genres ?? []).map(normalizeTasteToken));
      const includedHits = requiredGenres.filter((genre) => genres.has(genre)).length;
      const seedHits = [...seedGenres].filter((genre) => genres.has(genre)).length;
      const seedSimilarity = seedGenres.size ? seedHits / seedGenres.size : 0;
      const taste = animeGenreAffinity(anime, options.tasteGraph);
      const lengthAffinity = episodeLengthAffinity(anime, options.tasteGraph);
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
        seedSimilarity * 1.35 +
        taste.positive * 0.72 -
        taste.negative * 0.95 +
        lengthAffinity * 0.18 +
        lengthIntent * 0.65 +
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
  if (intent.excludeTerms.length) {
    const labels: Record<string, string> = { harem: 'гарема', mecha: 'меха', ecchi: 'эччи', school: 'школы' };
    parts.push(`без ${intent.excludeTerms.map((term) => labels[term] ?? term).join(', ')}`);
  }
  return parts;
}
