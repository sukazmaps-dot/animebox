import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const pkg = JSON.parse(read('package.json'));
const docs = read('docs/PATCH-21-PLAYBACK-WATCH-TOGETHER-FINAL.md');
const panel = read('components/watch-party/WatchPartyPanel.tsx');
const theater = read('components/watch-party/WatchTogetherTheater.module.css');
const episode = read('components/AnimeEpisodePage.tsx');
const nextConfig = read('next.config.ts');

const patch21 = String(pkg.scripts?.['patch21:check'] ?? '');

for (const needle of [
  'patch-21-playback-command-integrity-check.mjs',
  'patch-21-resume-continuity-check.mjs',
  'patch-21-timeline-automation-check.mjs',
  'patch-21-watch-together-sync-check.mjs',
  'patch-21-mobile-theater-check.mjs',
  'patch-21-username-safety-check.mjs',
]) {
  if (!patch21.includes(needle)) {
    failures.push(`patch21:check is missing ${needle}`);
  }
}

for (const [label, source, needle] of [
  ['Phase A status', docs, '### Phase A — Playback command integrity\nСтатус: **implemented**'],
  ['Phase B status', docs, '### Phase B — Resume / Source continuity\nСтатус: **implemented**'],
  ['Phase C status', docs, '### Phase C — OP / ED Timeline Automation Final\nСтатус: **implemented**'],
  ['Phase D status', docs, '### Phase D — Watch Together sync core\nСтатус: **implemented**'],
  ['Phase E status', docs, '### Phase E — Mobile theater / fullscreen\nСтатус: **implemented**'],
  ['username hardening status', docs, 'Urgent hardening — Public username safety'],
  ['authoritative reconnect sync', panel, 'requestAuthoritativeSync();'],
  ['fresh online callbacks', panel, 'requestAuthoritativeSync,\n    sendHostSync,'],
  ['real mobile viewport variable', episode, "'--animebox-wt-viewport-height'"],
  ['mobile viewport consumption', theater, 'var(--animebox-wt-viewport-height, 100dvh)'],
  ['Vercel image optimizer bypass retained', nextConfig, 'unoptimized: true'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (panel.includes('PLAYER_DRIFT_SEEK_SECONDS')) {
  failures.push('legacy fixed Watch Together drift threshold remains');
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase F] Release readiness failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 21 Phase F] Release branch invariants passed. Manual multi-client canary remains the final production check.',
);
