import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

type RouteRow = { id: number; slug: string };
const sources = [
  { table: 'anime_search_documents', id: 'anime_id' },
  { table: 'anime_catalog', id: 'id' },
  { table: 'seo_anime_index', id: 'anime_id' },
];

/** Recover pre-migration URLs without relying on the ephemeral SQLite registry. */
export async function findPersistentAnimeRoute(slug: string): Promise<RouteRow | null> {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const client = createSupabaseAdmin();
  const lookup = async (prefix: boolean) => {
    const results = await Promise.all(sources.map(async ({ table, id }) => {
      let query = client.from(table).select(`${id},slug`);
      query = prefix ? query.like('slug', `${slug}-%`) : query.eq('slug', slug);
      const { data, error } = await query.limit(21).abortSignal(AbortSignal.timeout(3000));
      if (error) return { rows: [] as RouteRow[], error };
      // An overflowing prefix is ambiguous, not a reason to pick the first title.
      if (prefix && data?.length === 21) return { rows: [] as RouteRow[], error: null };
      const rows: RouteRow[] = [];
      for (const raw of data ?? []) {
        const record = raw as unknown as Record<string, unknown>;
        const animeId = Number(record[id]);
        if (!Number.isSafeInteger(animeId) || animeId <= 0 || typeof record.slug !== 'string') continue;
        if (prefix && record.slug !== `${slug}-${animeId}`) continue;
        rows.push({ id: animeId, slug: record.slug });
      }
      return { rows, error: null };
    }));
    if (results.every(result => result.error)) throw new Error('Persistent anime route catalog unavailable');
    const rows = results.flatMap(result => result.rows);
    const ids = new Set(rows.map(row => row.id));
    return { route: ids.size === 1 ? rows[0] : null, ambiguous: ids.size > 1, failed: results.some(result => result.error) };
  };
  const exact = await lookup(false);
  if (exact.route || exact.ambiguous) return exact.route;
  const prefix = await lookup(true);
  if (!prefix.route && (exact.failed || prefix.failed)) throw new Error('Persistent anime route lookup incomplete');
  return prefix.route;
}
