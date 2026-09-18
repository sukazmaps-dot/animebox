import type { Metadata } from 'next';

import { getAnimeTitle } from '@/lib/anime-display';
import { getTitleContinuationHints } from '@/lib/search-intent';
import { cleanSeoText, truncateSeoText } from '@/lib/seo-text';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import type { Anime } from '@/types/anime';

export type AnimeSeoIdentity = {
  title: string;
  baseTitle: string;
  pageHeading: string;
  seasonNumber: number | null;
  partNumber: number | null;
  seasonLabel: string | null;
  aliases: string[];
  generatedAliases: string[];
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function stripContinuationMarkers(value: string): string {
  return value
    .replace(/(?:^|[\s:—\-–])(?:season|сезон)\s*[:#.-]?\s*\d{1,3}\b/giu, ' ')
    .replace(/(?:^|\s)\d{1,3}\s*(?:-?й|-?я|-?ый|-?ая|st|nd|rd|th)?\s*(?:season|сезон)\b/giu, ' ')
    .replace(/(?:^|[\s:—\-–])(?:part|часть|cour|кур)\s*[:#.-]?\s*\d{1,3}\b/giu, ' ')
    .replace(/(?:^|\s)\d{1,3}\s*(?:st|nd|rd|th)?\s*(?:part|часть|cour|кур)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:—\-–|]+$/g, '')
    .trim();
}

function seriesLike(anime: Anime): boolean {
  const format = String(anime.format ?? anime.kind ?? '').toLocaleLowerCase('ru-RU');
  return (
    format === 'tv' ||
    format.includes('тв') ||
    format.includes('сериал') ||
    format.includes('ona')
  );
}

function movieLike(anime: Anime): boolean {
  const format = String(anime.format ?? anime.kind ?? '').toLocaleLowerCase('ru-RU');
  return format === 'movie' || format.includes('фильм');
}

function allAnimeNames(anime: Anime): string[] {
  return uniqueStrings([
    anime.title?.russian,
    anime.russian,
    anime.title?.english,
    anime.title?.romaji,
    anime.title?.native,
    anime.name,
    ...(Array.isArray(anime.synonyms) ? anime.synonyms : []),
  ]);
}

function seasonAndPartFromTitles(anime: Anime): {
  seasonNumber: number | null;
  partNumber: number | null;
} {
  const hints = allAnimeNames(anime).map(getTitleContinuationHints);
  const explicitSeason = hints.find((hint) => hint.seasonNumber)?.seasonNumber ?? null;
  const explicitPart = hints.find((hint) => hint.partNumber)?.partNumber ?? null;

  const providerSeason = Number(anime.providerSeason);
  const safeProviderSeason =
    Number.isSafeInteger(providerSeason) && providerSeason > 1 && providerSeason <= 99
      ? providerSeason
      : null;

  return {
    seasonNumber: explicitSeason ?? safeProviderSeason,
    partNumber: explicitPart,
  };
}

function seasonLabel(seasonNumber: number | null, partNumber: number | null): string | null {
  if (!seasonNumber) return partNumber ? `Часть ${partNumber}` : null;
  return partNumber
    ? `${seasonNumber} сезон · часть ${partNumber}`
    : `${seasonNumber} сезон`;
}

function generatedSeasonAliases(
  bases: string[],
  seasonNumber: number | null,
  partNumber: number | null,
): string[] {
  if (!seasonNumber) return [];

  const generated: string[] = [];

  for (const base of bases.slice(0, 4)) {
    generated.push(`${base} ${seasonNumber} сезон`);
    generated.push(`${base} сезон ${seasonNumber}`);
    generated.push(`${base} Season ${seasonNumber}`);

    if (partNumber) {
      generated.push(`${base} ${seasonNumber} сезон ${partNumber} часть`);
      generated.push(`${base} Season ${seasonNumber} Part ${partNumber}`);
    }
  }

  return uniqueStrings(generated);
}

export function getAnimeSeoIdentity(anime: Anime): AnimeSeoIdentity {
  const title = getAnimeTitle(anime);
  const names = allAnimeNames(anime);
  const { seasonNumber, partNumber } = seasonAndPartFromTitles(anime);

  const strippedCandidates = uniqueStrings(
    names.map((name) => stripContinuationMarkers(name)).filter(Boolean),
  );

  const baseTitle =
    strippedCandidates.find((name) => /[А-Яа-яЁё]/.test(name)) ||
    strippedCandidates[0] ||
    title;

  const label = seriesLike(anime) ? seasonLabel(seasonNumber, partNumber) : null;
  const titleAlreadyContainsSeason = seasonNumber
    ? names.some((name) => getTitleContinuationHints(name).seasonNumber === seasonNumber)
    : false;

  const pageHeading = label && !titleAlreadyContainsSeason
    ? `${title} — ${label}`
    : title;

  const generatedAliases = generatedSeasonAliases(
    uniqueStrings([baseTitle, ...strippedCandidates]),
    seriesLike(anime) ? seasonNumber : null,
    partNumber,
  );

  const aliases = uniqueStrings([
    ...names.filter((name) => name.toLocaleLowerCase('ru-RU') !== title.toLocaleLowerCase('ru-RU')),
    ...generatedAliases,
  ]);

  return {
    title,
    baseTitle,
    pageHeading,
    seasonNumber: seriesLike(anime) ? seasonNumber : null,
    partNumber,
    seasonLabel: label,
    aliases,
    generatedAliases,
  };
}

function seoFacts(anime: Anime): string[] {
  const facts: string[] = [];

  if (anime.startDate?.year) facts.push(String(anime.startDate.year));
  if (anime.episodes && anime.episodes > 0) facts.push(`${anime.episodes} серий`);
  if (anime.genres?.length) facts.push(anime.genres.slice(0, 2).join(', '));

  return facts;
}

export function buildAnimeSeoTitle(
  anime: Anime,
  identity = getAnimeSeoIdentity(anime),
): string {
  const intent = movieLike(anime) ? 'смотреть аниме-фильм онлайн' : 'смотреть аниме онлайн';
  return truncateSeoText(`${identity.pageHeading} — ${intent}`, 64);
}

export function buildAnimeSeoDescription(
  anime: Anime,
  identity = getAnimeSeoIdentity(anime),
): string {
  const cleanedDescription = cleanSeoText(cleanShikimoriDescription(anime.description));
  const facts = seoFacts(anime);
  const factsText = facts.length ? ` ${facts.join(' · ')}.` : '';

  const seasonIntent = identity.seasonLabel
    ? ' Смотрите серии, порядок сезонов и продолжайте просмотр с сохранением прогресса.'
    : ' Смотрите серии, сохраняйте прогресс и находите связанные части.';

  return truncateSeoText(
    `Смотреть аниме «${identity.pageHeading}» онлайн на AnimeBox.${factsText}${seasonIntent}${
      cleanedDescription ? ` ${cleanedDescription}` : ''
    }`,
    158,
  );
}

function seoImages(anime: Anime): string[] {
  return uniqueStrings([
    anime.bannerImage,
    anime.coverImage?.extraLarge,
    anime.coverImage?.large,
    anime.coverImage?.medium,
  ]);
}

export function shouldIndexAnime(anime: Anime): boolean {
  if (anime.catalogEligible === false) return false;

  const names = allAnimeNames(anime);
  if (!names.length) return false;

  // Quality gate for long-tail pages. We want obscure titles indexed, not thin
  // provider stubs. A real description is strongest; otherwise two independent
  // factual signals are enough (for example year + cover, or genres + episodes).
  const description = cleanSeoText(cleanShikimoriDescription(anime.description));
  let score = description.length >= 80 ? 2 : description.length >= 20 ? 1 : 0;

  if (anime.startDate?.year) score += 1;
  if (anime.episodes && anime.episodes > 0) score += 1;
  if (anime.genres?.length) score += 1;
  if (anime.coverImage?.large || anime.coverImage?.extraLarge || anime.bannerImage) score += 1;

  return score >= 2;
}

export function buildAnimeMetadata(anime: Anime, canonicalUrl: string): Metadata {
  const identity = getAnimeSeoIdentity(anime);
  const description = buildAnimeSeoDescription(anime, identity);
  const images = seoImages(anime);
  const index = shouldIndexAnime(anime);

  return {
    title: buildAnimeSeoTitle(anime, identity),
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      siteName: 'AnimeBox',
      locale: 'ru_RU',
      title: `${identity.pageHeading} — смотреть онлайн`,
      description,
      images: images.length ? images.map((url) => ({ url })) : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${identity.pageHeading} — смотреть онлайн`,
      description,
      images: images.length ? images.slice(0, 1) : undefined,
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

export function buildAnimeStructuredData(
  anime: Anime,
  canonicalUrl: string,
  image?: string | null,
) {
  const identity = getAnimeSeoIdentity(anime);
  const description = buildAnimeSeoDescription(anime, identity);
  const aliases = uniqueStrings([...identity.aliases]).slice(0, 16);
  const datePublished = anime.startDate?.year
    ? `${anime.startDate.year}-${String(anime.startDate.month ?? 1).padStart(2, '0')}-${String(anime.startDate.day ?? 1).padStart(2, '0')}`
    : undefined;

  const common = {
    '@context': 'https://schema.org',
    name: identity.pageHeading,
    alternateName: aliases.length ? aliases : undefined,
    description,
    url: canonicalUrl,
    image: image || seoImages(anime)[0] || undefined,
    genre: anime.genres?.length ? anime.genres : undefined,
    datePublished,
    inLanguage: 'ru-RU',
    sameAs: anime.idMal
      ? [`https://myanimelist.net/anime/${anime.idMal}`]
      : undefined,
  };

  if (movieLike(anime)) {
    return {
      ...common,
      '@type': 'Movie',
    };
  }

  const television = {
    ...common,
    numberOfEpisodes: anime.episodes || undefined,
  };

  if (seriesLike(anime) && identity.seasonNumber) {
    return {
      ...television,
      '@type': 'TVSeason',
      seasonNumber: identity.seasonNumber,
      partOfSeries: {
        '@type': 'TVSeries',
        name: identity.baseTitle,
      },
    };
  }

  return {
    ...television,
    '@type': 'TVSeries',
  };
}
