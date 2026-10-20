import type { RecommendationRail, RecommendationRailId } from '@/lib/recommendation-rails';

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

export type HomeRailAdmission = {
  session: string;
  rows: ReadonlySet<RecommendationRailId>;
};

/** Admit only measured, sufficiently filled rows. Once shown, a row is sticky
 * for the session, so hiding a title or resizing cannot collapse the page.
 */
export function admitHomeRails(
  previous: HomeRailAdmission,
  session: string,
  rails: RecommendationRail[],
  targets: ReadonlyMap<RecommendationRailId, number>,
): HomeRailAdmission {
  const sameSession = previous.session === session;
  const rows = new Set(sameSession ? previous.rows : []);
  const seen = new Set<number>();
  const order = new Map([...rows].map((id, index) => [id, index] as const));
  const ordered = [...rails].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  for (const rail of ordered) {
    let count = 0;
    for (const { anime } of rail.items) {
      if (!seen.has(anime.id)) count += 1;
      seen.add(anime.id);
    }
    const target = targets.get(rail.id);
    if (target != null && Number.isFinite(target) && target >= 5 && count >= target) rows.add(rail.id);
  }
  if (sameSession && rows.size === previous.rows.size) return previous;
  return { session, rows };
}
