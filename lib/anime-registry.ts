import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { slugify } from './anime-url';

type Row = { id: number; slug: string; titles: string; provider_alias: string | null; provider_season: number };
type Statement = {
  get(...values: (string | number)[]): Row | undefined;
  run(...values: (string | number | null)[]): unknown;
};
type Database = { exec(sql: string): void; prepare(sql: string): Statement };
// Node >=22.13. No native npm addon; kept server-side only.

let connection: Database | undefined;
function db(): Database {
  if (connection) return connection;
  if (process.env.VERCEL && !process.env.ANIMEBOX_DB_PATH) {
    throw new Error('Configure a persistent database before deploying the slug registry on serverless.');
  }
  const path = resolve(/* turbopackIgnore: true */ process.env.ANIMEBOX_DB_PATH || '.data/animebox.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  connection = new DatabaseSync(path);
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS anime_routes (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, titles TEXT NOT NULL,
      provider_alias TEXT, provider_season INTEGER NOT NULL DEFAULT 1 CHECK(provider_season > 0)
    );`);
  return connection;
}
export type RoutableAnime = { id: number; title: { romaji?: string | null; english?: string | null; russian?: string | null; native?: string | null } };
export function registerAnime<T extends RoutableAnime>(anime: T): T & { slug: string } {
  const database = db();
  const titles = JSON.stringify(anime.title);
  database.exec('BEGIN IMMEDIATE');
  try {
    let row = database.prepare('SELECT * FROM anime_routes WHERE id = ?').get(anime.id);
    if (!row) {
      const normalized = slugify(anime.title.romaji || anime.title.english || anime.title.russian || 'anime');
      const base = /^\d+$/.test(normalized) || ['sources', 'soursces', 'stream'].includes(normalized) ? `anime-${normalized}` : normalized;
      let slug = base, suffix = 2;
      while (database.prepare('SELECT * FROM anime_routes WHERE slug = ?').get(slug)) slug = `${base}-${suffix++}`;
      database.prepare('INSERT INTO anime_routes(id, slug, titles) VALUES (?, ?, ?)').run(anime.id, slug, titles);
      row = database.prepare('SELECT * FROM anime_routes WHERE id = ?').get(anime.id)!;
    } else {
      // Preserve localized titles when a later catalogue response is incomplete.
      const previous = JSON.parse(row.titles) as Record<string, string | null>;
      for (const [key, value] of Object.entries(anime.title)) if (value) previous[key] = value;
      database.prepare('UPDATE anime_routes SET titles = ? WHERE id = ?').run(JSON.stringify(previous), anime.id);
    }
    database.exec('COMMIT');
    return { ...anime, slug: row.slug };
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}
export function findAnimeRoute(slug: string): Row | undefined {
  return db().prepare('SELECT * FROM anime_routes WHERE slug = ?').get(slug);
}
export function findAnimeRouteById(id: number): Row | undefined {
  return db().prepare('SELECT * FROM anime_routes WHERE id = ?').get(id);
}
