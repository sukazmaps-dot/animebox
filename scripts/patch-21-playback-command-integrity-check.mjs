import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const failures = [];
const player = read('components/AnimePlayer.tsx');
const contract = read('docs/PATCH-21-PLAYBACK-WATCH-TOGETHER-FINAL.md');

function need(label, needle) {
  if (!player.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

need('episode transition latch', 'episodeTransitionCommittedRef.current');
need('episode transition exactly-once guard', 'if (episodeTransitionCommittedRef.current) return;');
need('remote sequence guard', 'detail.seq <= lastAppliedPartyCommandSeqRef.current');
need('remote sequence commit', 'lastAppliedPartyCommandSeqRef.current = detail.seq');
need('remote sequence episode reset', 'lastAppliedPartyCommandSeqRef.current = -1;');
need('WT listener normal-playback guard', 'if (!watchTogetherMode) return;');
need('idempotent Kodik play', "detail.action === 'play' && !state.playing");
need('idempotent Kodik pause', "detail.action === 'pause' && state.playing");
need('idempotent native play', "detail.action === 'play' && video.paused");
need('idempotent native pause', "detail.action === 'pause' && !video.paused");
need('micro seek suppression', "detail.action === 'seek'\n          ? drift > 0.35");
need('sync drift threshold', ': drift > 2.2');

if (!contract.includes('Episode transition exactly-once')) {
  failures.push('Patch 21 contract: missing exactly-once transition requirement.');
}

const applyStart = player.indexOf('const applyPartyCommand = useCallback');
const applyEnd = player.indexOf('const clearOpeningSkipFallback', applyStart);
const applyBlock = applyStart >= 0 && applyEnd > applyStart
  ? player.slice(applyStart, applyEnd)
  : '';

for (const forbidden of [
  "if (detail.action === 'play') player.play();",
  "if (detail.action === 'pause') player.pause();",
]) {
  if (applyBlock.includes(forbidden)) {
    failures.push(`applyPartyCommand: unconditional provider command remains: ${forbidden}`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase A] Playback command integrity failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[AnimeBox Patch 21 Phase A] Playback command integrity passed.');
