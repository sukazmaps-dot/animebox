import { parseAnimeSearchIntent } from '@/lib/search-intent';
import { parseSmartDiscoveryQuery } from '@/lib/smart-discovery';

export type SearchQueryMode = 'title' | 'structured' | 'context';

export type SearchQueryClassification = {
  raw: string;
  mode: SearchQueryMode;
  wordCount: number;
  titleIntent: ReturnType<typeof parseAnimeSearchIntent>;
  discoveryIntent: ReturnType<typeof parseSmartDiscoveryQuery>;
};

export function classifySearchQuery(rawValue: string): SearchQueryClassification {
  const raw = rawValue.replace(/\s+/g, ' ').trim();
  const titleIntent = parseAnimeSearchIntent(raw);
  const discoveryIntent = parseSmartDiscoveryQuery(raw);
  const wordCount = raw.split(/\s+/).filter(Boolean).length;

  const hasStructuredMarkers = Boolean(
    titleIntent.seasonNumber ||
    titleIntent.partNumber ||
    titleIntent.episodeNumber,
  );

  const hasStrongContextSignal = Boolean(
    discoveryIntent.similarTo ||
    discoveryIntent.excludeTerms.length ||
    discoveryIntent.maxEpisodes ||
    discoveryIntent.minEpisodes ||
    discoveryIntent.minYear ||
    discoveryIntent.preferShorter ||
    discoveryIntent.preferLonger ||
    discoveryIntent.completedOnly ||
    discoveryIntent.movieOnly,
  );

  const hasNaturalLanguageContext =
    wordCount >= 4 &&
    discoveryIntent.isDiscovery &&
    Boolean(
      discoveryIntent.freeText ||
      discoveryIntent.includeGenres.length ||
      discoveryIntent.includeTags.length,
    );

  const mode: SearchQueryMode = hasStructuredMarkers
    ? 'structured'
    : hasStrongContextSignal || hasNaturalLanguageContext
      ? 'context'
      : 'title';

  return {
    raw,
    mode,
    wordCount,
    titleIntent,
    discoveryIntent,
  };
}

export function shouldBootstrapSearchProvider(
  classification: SearchQueryClassification,
) {
  return (
    classification.mode !== 'context' &&
    classification.raw.length >= 4
  );
}
