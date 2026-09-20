import type { Anime } from '@/types/anime';

const EN_TO_RU: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л',
  l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
  ',': 'б', '.': 'ю',
};

const RU_TO_EN = Object.fromEntries(
  Object.entries(EN_TO_RU).map(([english, russian]) => [russian, english]),
) as Record<string, string>;

const SEARCH_STOP_WORDS = new Set([
  'anime', 'аниме', 'watch', 'online', 'онлайн', 'смотреть', 'посмотреть',
  'season', 'сезон', 'episode', 'эпизод', 'серия', 'серии', 'part', 'часть',
]);

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalize(value: string) {
  return compact(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru-RU')
      .replace(/[’'`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' '),
  );
}

function translateKeyboard(value: string, map: Record<string, string>) {
  return value
    .toLocaleLowerCase('ru-RU')
    .split('')
    .map((char) => map[char] ?? char)
    .join('');
}

export function swapKeyboardLayout(value: string) {
  const normalized = value.toLocaleLowerCase('ru-RU');
  const hasCyrillic = /[а-яё]/u.test(normalized);
  const hasLatin = /[a-z]/u.test(normalized);

  if (hasCyrillic && !hasLatin) return compact(translateKeyboard(normalized, RU_TO_EN));
  if (hasLatin && !hasCyrillic) return compact(translateKeyboard(normalized, EN_TO_RU));
  return normalized;
}

function meaningfulTokens(value: string) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token));
}

/**
 * Extra upstream queries are deliberately conservative: a healthy normal
 * search never triggers them. They are only used when the first provider
 * search produced too few candidates.
 */
export function buildSmartSearchFallbacks(rawQuery: string, titleQuery: string) {
  const result: string[] = [];
  const seen = new Set([normalize(titleQuery), normalize(rawQuery)]);

  const layout = swapKeyboardLayout(titleQuery);
  if (layout && !seen.has(normalize(layout))) {
    result.push(layout);
    seen.add(normalize(layout));
  }

  const tokens = meaningfulTokens(titleQuery).sort((a, b) => b.length - a.length);
  const longest = tokens[0];
  if (longest && longest.length >= 6) {
    const prefix = longest.slice(0, Math.max(4, longest.length - 2));
    if (!seen.has(normalize(prefix))) {
      result.push(prefix);
      seen.add(normalize(prefix));
    }
  }

  return result.slice(0, 2);
}

function animeTitles(anime: Anime) {
  return [
    anime.title?.russian,
    anime.russian,
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.native,
    anime.name,
    ...(anime.synonyms ?? []),
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function bigrams(value: string) {
  const clean = normalize(value).replace(/\s+/g, '');
  const pairs = new Set<string>();
  for (let index = 0; index < clean.length - 1; index += 1) {
    pairs.add(clean.slice(index, index + 2));
  }
  return pairs;
}

function diceSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;

  let shared = 0;
  for (const pair of a) if (b.has(pair)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function scoreTitle(title: string, query: string, queryTokens: string[]) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return 0;

  let score = 0;
  if (normalizedTitle === query) score += 1600;
  else if (normalizedTitle.startsWith(query)) score += 1100;
  else if (normalizedTitle.includes(query)) score += 780;
  else if (query.includes(normalizedTitle) && normalizedTitle.length >= 5) score += 520;

  const titleTokens = new Set(normalizedTitle.split(' '));
  let tokenHits = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) tokenHits += 1;
    else if ([...titleTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
      tokenHits += 0.65;
    }
  }

  if (queryTokens.length) score += (tokenHits / queryTokens.length) * 420;
  score += diceSimilarity(normalizedTitle, query) * 300;
  return score;
}

/** Reranks provider-returned candidates; it never invents an anime. */
export function rankAnimeForSmartSearch(candidates: Anime[], queryValue: string) {
  const query = normalize(queryValue);
  if (!query) return candidates;
  const queryTokens = meaningfulTokens(query);

  return candidates
    .map((anime, index) => ({
      anime,
      index,
      score: Math.max(0, ...animeTitles(anime).map((title) => scoreTitle(title, query, queryTokens))),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ anime }) => anime);
}

export function mergeAnimeCandidates(...groups: Anime[][]) {
  const byId = new Map<number, Anime>();
  for (const group of groups) {
    for (const anime of group) {
      if (!byId.has(anime.id)) byId.set(anime.id, anime);
    }
  }
  return [...byId.values()];
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterateSearchQuery(value: string) {
  return compact(
    value
      .toLocaleLowerCase('ru-RU')
      .split('')
      .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
      .join(''),
  );
}

/**
 * Small bounded list used only when exact entity resolution failed. Keeping it
 * bounded is important: typo tolerance must not multiply provider traffic for
 * every healthy search.
 */
export function buildEntityResolutionQueries(value: string) {
  const source = compact(value);
  const result: string[] = [];
  const seen = new Set<string>();

  const append = (candidate: string) => {
    const clean = compact(candidate);
    const key = normalize(clean);
    if (!clean || clean.length < 2 || seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  };

  append(source);
  append(swapKeyboardLayout(source));

  if (/[а-яё]/iu.test(source)) {
    append(transliterateSearchQuery(source));
  }

  const tokens = meaningfulTokens(source).sort((a, b) => b.length - a.length);
  const longest = tokens[0];
  if (longest && longest.length >= 6) {
    append(longest.slice(0, Math.max(4, longest.length - 2)));
  }

  return result.slice(0, 4);
}
