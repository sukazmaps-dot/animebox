import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const player = read('components/AnimePlayer.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const timelineServer = read('lib/episode-timeline-server.ts');
const safety = read('lib/episode-timeline-safety.ts');

for (const [label, source, needle] of [
  [
    'shared player opening safety decision',
    player,
    'openingSkipSafetyDecision({',
  ],
  [
    'auto skip requires observed duration',
    player,
    "requireObservedDuration: mode === 'auto'",
  ],
  [
    'time samples validate opening before auto seek',
    player,
    'requireObservedDuration: true',
  ],
  [
    'actual player duration callback',
    player,
    'onDurationObserved(observedDurationSeconds)',
  ],
  [
    'timeline refresh sends actual duration',
    episodePage,
    "params.set(\n          'durationSeconds'",
  ],
  [
    'timeline refresh callback wired to player',
    episodePage,
    'onDurationObserved={handleTimelineDurationObserved}',
  ],
  [
    'stale timeline duration cache invalidation',
    timelineServer,
    'timelineDurationMatchesObserved(',
  ],
  [
    'non-found rows cannot expose stale skip segments',
    timelineServer,
    "const segmentsUsable = row.skip_lookup_status === 'found'",
  ],
  [
    'server rejects implausible opening intervals',
    timelineServer,
    'const openingDecision = openingSkipSafetyDecision({',
  ],
  [
    'error path clears opening start',
    timelineServer,
    'opening_start_ms: null',
  ],
  [
    'opening length hard cap',
    safety,
    'MAX_AUTO_OPENING_SEGMENT_SECONDS = 4 * 60',
  ],
  [
    'opening start position cap',
    safety,
    'MAX_AUTO_OPENING_START_RATIO = 0.35',
  ],
  [
    'opening end ratio cap',
    safety,
    'MAX_AUTO_OPENING_END_RATIO = 0.45',
  ],
  [
    'duration mismatch guard',
    safety,
    "return unsafe('duration_mismatch'",
  ],
  [
    'near-end seek guard',
    safety,
    "return unsafe('opening_too_close_to_end'",
  ],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (
  player.includes('const targetSeconds = opening.endMs / 1000;')
) {
  failures.push(
    'AnimePlayer still seeks directly to unvalidated opening.endMs.',
  );
}

if (
  timelineServer.includes(
    'if (existing && isFresh(existing)) {',
  )
) {
  failures.push(
    'timeline server can still return a fresh cache row without observed-duration validation.',
  );
}

if (failures.length) {
  console.error('[AnimeBox Opening Skip Safety] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Opening Skip Safety] observed-duration and bounded-seek invariants passed.',
);
