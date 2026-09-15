// Explicit editorial mapping; no guessed relationship between franchise and provider seasons.
const { DatabaseSync } = require('node:sqlite');
const { resolve } = require('node:path');
const [slug, alias, rawSeason = '1'] = process.argv.slice(2);
const season = Number(rawSeason);
if (!slug || !alias || !Number.isSafeInteger(season) || season < 1) {
  console.error('Usage: node scripts/set-release.cjs <existing-slug> <provider-alias> [provider-season=1]');
  process.exit(1);
}
const db = new DatabaseSync(resolve(process.env.ANIMEBOX_DB_PATH || '.data/animebox.sqlite'));
const result = db.prepare('UPDATE anime_routes SET provider_alias = ?, provider_season = ? WHERE slug = ?').run(alias, season, slug);
if (!result.changes) { console.error('Slug not found. Open this title in the catalogue first.'); process.exitCode = 1; }
else console.log('Release mapping saved:', slug, alias, season);
db.close();
