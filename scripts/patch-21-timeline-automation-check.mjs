import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const player = read('components/AnimePlayer.tsx');
const kodik = read('components/KodikPlayer.tsx');

for (const [label, source, needle] of [
  ['pending OP seek duplicate guard', player, 'const pendingTarget = openingSkipTargetRef.current;'],
  ['pending OP seek acknowledgement guard', player, 'A previous OP seek is still waiting for provider acknowledgement.'],
  ['successful OP request latches automation', player, 'openingAutoSkipAttemptedRef.current = true;'],
  ['successful OP request clears armed candidate', player, 'openingAutoSkipCandidateRef.current = null;'],
  ['OP acknowledgement clears pending target', player, 'openingSkipTargetRef.current = null;'],
  ['ending start is informational only', player, 'navigation is armed exclusively'],
  ['Kodik strict synthetic end threshold', kodik, 'SYNTHETIC_END_REMAINING_SECONDS = 0.2'],
  ['Kodik synthetic end confirmation', kodik, 'SYNTHETIC_END_CONFIRM_MS = 1_500'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

const requestStart = player.indexOf('const requestOpeningSkip = useCallback');
const requestEnd = player.indexOf('const registerExplicitSeek = useCallback', requestStart);
const requestBlock =
  requestStart >= 0 && requestEnd > requestStart
    ? player.slice(requestStart, requestEnd)
    : '';

if (!requestBlock) {
  failures.push('requestOpeningSkip block could not be isolated');
} else {
  const latchIndex = requestBlock.indexOf('openingAutoSkipAttemptedRef.current = true;');
  const targetIndex = requestBlock.indexOf('openingSkipTargetRef.current = targetSeconds;');
  if (latchIndex < 0 || targetIndex < 0 || latchIndex > targetIndex) {
    failures.push('opening skip latch must be committed before pending target publication');
  }

  if (!requestBlock.includes('if (!requested)')) {
    failures.push('failed opening seek no longer preserves the manual fallback path');
  }
}

const timeSampleStart = player.indexOf('const handleTimeSample = useCallback');
const timeSampleEnd = player.indexOf('const skipOpening = useCallback', timeSampleStart);
const timeSampleBlock =
  timeSampleStart >= 0 && timeSampleEnd > timeSampleStart
    ? player.slice(timeSampleStart, timeSampleEnd)
    : '';

if (
  timeSampleBlock.includes('setAutoNextSeconds(AUTO_NEXT_COUNTDOWN_SECONDS)') ||
  timeSampleBlock.includes('continueFromEndScreen()')
) {
  failures.push('timeupdate path can still start episode navigation before ended');
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase C] Timeline automation check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[AnimeBox Patch 21 Phase C] OP/ED exactly-once timeline invariants passed.');
