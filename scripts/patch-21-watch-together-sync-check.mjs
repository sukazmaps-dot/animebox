import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const protocol = read('lib/watch-party.ts');
const player = read('components/AnimePlayer.tsx');
const panel = read('components/watch-party/WatchPartyPanel.tsx');

for (const [label, source, needle] of [
  ['command semantic type', protocol, "commandKind?: 'action' | 'sync'"],
  ['player sync/action distinction', player, "const syncCorrection = detail.commandKind === 'sync'"],
  ['sync accepts same sequence', player, '? detail.seq < lastAppliedPartyCommandSeqRef.current'],
  ['action rejects same sequence', player, ': detail.seq <= lastAppliedPartyCommandSeqRef.current'],
  ['sequence advances only forward', player, 'detail.seq > lastAppliedPartyCommandSeqRef.current'],
  ['network action replay guard', panel, 'packet.seq <= lastAppliedSeqRef.current'],
  ['network sync stale guard', panel, 'packet.seq < lastAppliedSeqRef.current'],
  ['hot snapshot ref', panel, 'playerStateRef.current = detail;'],
  ['UI position throttle', panel, 'PLAYER_UI_POSITION_STEP_SECONDS = 0.9'],
  ['UI snapshot ref', panel, 'playerUiStateRef.current = detail;'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

const actionTags = (panel.match(/commandKind: 'action'/g) ?? []).length;
const syncTags = (panel.match(/commandKind: 'sync'/g) ?? []).length;

if (actionTags !== 3) {
  failures.push(`expected 3 authoritative action tags, found ${actionTags}`);
}

if (syncTags !== 6) {
  failures.push(`expected 6 sync correction tags, found ${syncTags}`);
}

const onPlayerStateStart = panel.indexOf('function onPlayerState(event: Event)');
const onPlayerStateEnd = panel.indexOf('function onPlayerAction(event: Event)', onPlayerStateStart);
const onPlayerStateBlock =
  onPlayerStateStart >= 0 && onPlayerStateEnd > onPlayerStateStart
    ? panel.slice(onPlayerStateStart, onPlayerStateEnd)
    : '';

if (!onPlayerStateBlock) {
  failures.push('onPlayerState block could not be isolated');
} else {
  const refUpdate = onPlayerStateBlock.indexOf('playerStateRef.current = detail;');
  const renderUpdate = onPlayerStateBlock.indexOf('setPlayerState(detail);');

  if (refUpdate < 0 || renderUpdate < 0 || refUpdate > renderUpdate) {
    failures.push('transport snapshot must update before any React UI commit');
  }

  if (!onPlayerStateBlock.includes('if (!semanticChange && !visiblePositionStep) return;')) {
    failures.push('high-frequency player state no longer has a React render throttle');
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase D] Watch Together sync check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[AnimeBox Patch 21 Phase D] Watch Together replay, sync and hot-path UI invariants passed.');
