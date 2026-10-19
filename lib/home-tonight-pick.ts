import type { RankedRecommendation } from '@/lib/recommendations';
import type { TasteMood } from '@/lib/personalization';
import { getAnimeTitle } from '@/lib/anime-display';
import { isHomePublicSafe } from '@/lib/home-public-filter';
import { cleanSeoText, truncateSeoText } from '@/lib/seo-text';

/** Consume the ranked pool without re-ranking or changing rail ownership. */
export function homeTonightCandidates(items: RankedRecommendation[], mood: TasteMood) {
  const seen = new Set<number>();
  return items.filter(item => {
    const anime = item.anime;
    if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0 || seen.has(anime.id)) return false;
    if (!isHomePublicSafe(anime) || getAnimeTitle(anime) === 'Без названия') return false;
    if (item.franchiseRequiresPrevious && !item.franchiseContinuation) return false;
    if (mood !== 'any' && item.moodTier !== 'strong' && item.moodTier !== 'good') return false;
    seen.add(anime.id);
    return true;
  });
}

export function homeTonightReason(item: RankedRecommendation, mood: TasteMood, hasWatchHistory: boolean) {
  const explanations = item.explanations ?? [];
  const publicReasons = new Set(['mood_match', 'community_quality', 'short_finished', 'ongoing', 'discovery', 'hidden_gem']);
  const evidence = (mood !== 'any' ? explanations.find(reason => reason.key === 'mood_match') : null)
    ?? explanations.find(reason => hasWatchHistory || publicReasons.has(reason.key));
  const reason = cleanSeoText(evidence?.text || (hasWatchHistory ? item.reason : ''));
  return truncateSeoText(reason || 'Один из вариантов текущей подборки.', 160);
}
