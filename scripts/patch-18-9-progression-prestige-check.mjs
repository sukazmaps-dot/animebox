import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

const progression = read('lib/progression.ts');
const milestones = read('lib/progression-milestones.ts');
const server = read('lib/progression-server.ts');
const statusRoute = read('app/api/community/progression/status/route.ts');
const migration = read('supabase/migrations/20260927003000_progression_prestige_v1.sql');

const failures = [];
const checks = [
  ['progression reaches LV100', progression.includes('export const MAX_LEVEL = 100')],
  ['milestones are 10/25/50/75/100', [10, 25, 50, 75, 100].every((level) => milestones.includes(`level: ${level}`))],
  ['Prestige I does not reset XP', migration.includes('never resets or subtracts XP') && !migration.includes('total_xp = 0')],
  ['Prestige I threshold matches LV100 curve', migration.includes('205920')],
  ['Premium XP boost disabled at sync boundary', server.includes('p_premium_boost: false')],
  ['status API exposes visual evolution', statusRoute.includes('premiumEvolutionEnabled') || statusRoute.includes('progressionEvolutionState')],
  ['progression-v3 visual contract exists', milestones.includes('/brand/progression-v3/frame-prestige.svg')],
];

for (const [label, ok] of checks) if (!ok) failures.push(label);

if (failures.length) {
  console.error('[AnimeBox 18.9 Progression & Prestige] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox 18.9 Progression & Prestige] LV100, Prestige I, fair XP and visual evolution invariants passed.');
