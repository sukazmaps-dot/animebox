import type { RecommendationRail } from '@/lib/recommendation-rails';

/** Keep mounted rows in place; late discoveries go below existing rows. */
export function reconcileHomeRails(
  previous: RecommendationRail[],
  incoming: RecommendationRail[],
  availableIds: ReadonlySet<number>,
): RecommendationRail[] {
  const byId = new Map(incoming.map((rail) => [rail.id, rail]));
  const known = new Set(previous.map((rail) => rail.id));
  return [
    ...previous.map((rail) => byId.get(rail.id) ?? {
      ...rail,
      items: rail.items.filter(({ anime }) => availableIds.has(anime.id)),
    }),
    ...incoming.filter((rail) => !known.has(rail.id)),
  ];
}
