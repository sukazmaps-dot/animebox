import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { slugify, stableAnimeSlug } from './anime-url';

type Row = {
  id: number;
  slug: string;
  titles: string;
  provider_alias: string | null;
  provider_season: number;
};

type Statement = {
  get(...values: (string | number)[]): Row | undefined;
  run(...values: (string | number | null)[]): unknown;
};

type Database = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

// Node >=22.13. No native npm addon; kept server-side only.
let connection: Database | undefined;

const memoryById = new Map<number, Row>();
const memoryBySlug = new Map<string, Row>();

function usesStatelessRegistry(): boolean {
  // Vercel functions do not provide a shared persistent filesystem.
  // When no external/persistent path is configured, use deterministic slugs
  // and keep only request-instance metadata in memory instead of crashing.
  return Boolean(process.env.VERCEL && !process.env.ANIMEBOX_DB_PATH);
}

function db(): Database {
  if (connection) return connection;

  const path = resolve(
    /* turbopackIgnore: true */ process.env.ANIMEBOX_DB_PATH || '.data/animebox.sqlite',
  );

  mkdirSync(dirname(path), { recursive: true });
  connection = new DatabaseSync(path);
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS anime_routes (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, titles TEXT NOT NULL,
      provider_alias TEXT, provider_season INTEGER NOT NULL DEFAULT 1 CHECK(provider_season > 0)
    );`);

  return connection;
}

export type RoutableAnime = {
  id: number;
  title: {
    romaji?: string | null;
    english?: string | null;
    russian?: string | null;
    native?: string | null;
  };
};

export function registerAnime<T extends RoutableAnime>(anime: T): T & { slug: string } {
  const titles = JSON.stringify(anime.title);

  if (usesStatelessRegistry()) {
    const title =
      anime.title.romaji ||
      anime.title.english ||
      anime.title.russian ||
      anime.title.native ||
      'anime';

    const slug = stableAnimeSlug(anime.id, title);
    const previous = memoryById.get(anime.id);
    const row: Row = {
      id: anime.id,
      slug,
      titles,
      provider_alias: previous?.provider_alias ?? null,
      provider_season: previous?.provider_season ?? 1,
    };

    memoryById.set(anime.id, row);
    memoryBySlug.set(slug, row);

    return { ...anime, slug };
  }

  const database = db();
  database.exec('BEGIN IMMEDIATE');

  try {
    let row = database.prepare('SELECT * FROM anime_routes WHERE id = ?').get(anime.id);

    if (!row) {
      const normalized = slugify(
        anime.title.romaji || anime.title.english || anime.title.russian || 'anime',
      );
      const base =
        /^\d+$/.test(normalized) || ['sources', 'soursces', 'stream'].includes(normalized)
          ? `anime-${normalized}`
          : normalized;

      let slug = base;
      let suffix = 2;

      while (database.prepare('SELECT * FROM anime_routes WHERE slug = ?').get(slug)) {
        slug = `${base}-${suffix++}`;
      }

      database
        .prepare('INSERT INTO anime_routes(id, slug, titles) VALUES (?, ?, ?)')
        .run(anime.id, slug, titles);
      row = database.prepare('SELECT * FROM anime_routes WHERE id = ?').get(anime.id)!;
    } else {
      // Preserve localized titles when a later catalogue response is incomplete.
      const previous = JSON.parse(row.titles) as Record<string, string | null>;
      for (const [key, value] of Object.entries(anime.title)) {
        if (value) previous[key] = value;
      }
      database
        .prepare('UPDATE anime_routes SET titles = ? WHERE id = ?')
        .run(JSON.stringify(previous), anime.id);
    }

    database.exec('COMMIT');
    return { ...anime, slug: row.slug };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function findAnimeRoute(slug: string): Row | undefined {
  if (usesStatelessRegistry()) return memoryBySlug.get(slug);
  return db().prepare('SELECT * FROM anime_routes WHERE slug = ?').get(slug);
}

export function findAnimeRouteById(id: number): Row | undefined {
  if (usesStatelessRegistry()) return memoryById.get(id);
  return db().prepare('SELECT * FROM anime_routes WHERE id = ?').get(id);
}

/**
 * Stateless Vercel slugs end in the canonical AniList id.
 * Local/DB slugs intentionally keep their old format and are resolved from SQLite.
 */
export function getAnimeIdFromStableSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
