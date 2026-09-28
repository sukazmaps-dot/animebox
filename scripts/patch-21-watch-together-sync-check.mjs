import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const protocol = read('lib/watch-party.ts');
const player = read('components/AnimePlayer.tsx');
const panel = read('components/watch-party/WatchPartyPanel.tsx');
const syncPolicy = read('lib/watch-party-sync-policy.ts');

for (const [label, source, needle] of [
  ['command semantic type', protocol, "commandKind?: 'action' | 'sync'"],
  ['host epoch on apply', protocol, 'hostEpoch?: number;'],
  ['explicit sync request packet', protocol, "type: 'PLAYER_SYNC_REQUEST'"],
  ['player sync/action distinction', player, "const syncCorrection = detail.commandKind === 'sync'"],
  ['sync accepts same sequence', player, '? detail.seq < lastAppliedPartyCommandSeqRef.current'],
  ['action rejects same sequence', player, ': detail.seq <= lastAppliedPartyCommandSeqRef.current'],
  ['sequence advances only forward', player, 'detail.seq > lastAppliedPartyCommandSeqRef.current'],
  ['guest host epoch guard', panel, 'acceptPlaybackHostEpoch'],
  ['guest explicit resync request', panel, 'requestAuthoritativeSync'],
  ['host explicit sync-request handling', panel, "packet.type === 'PLAYER_SYNC_REQUEST'"],
  ['host action admission guard', panel, 'allowSequencedPlayerAction'],
  ['player action minimum interval', panel, 'PLAYER_ACTION_MIN_INTERVAL_MS = 220'],
  ['player action duplicate window', panel, 'PLAYER_ACTION_DUPLICATE_WINDOW_MS = 900'],
  ['player action burst limit', panel, 'PLAYER_ACTION_MAX_PER_WINDOW = 8'],
  ['network action replay guard', panel, 'packet.seq <= lastAppliedSeqRef.current'],
  ['network sync stale guard', panel, 'packet.seq < lastAppliedSeqRef.current'],
  ['drift decision integration', panel, 'decideWatchPartySync({'],
  ['drift correction cooldown ref', panel, 'lastDriftCorrectionAtRef.current'],
  ['hot snapshot ref', panel, 'playerStateRef.current = detail;'],
  ['UI position throttle', panel, 'PLAYER_UI_POSITION_STEP_SECONDS = 0.9'],
  ['UI snapshot ref', panel, 'playerUiStateRef.current = detail;'],
  ['reconnect authoritative resync', panel, 'requestAuthoritativeSync();'],
  ['host resume broadcast', panel, 'sendHostSync();'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (panel.includes('PLAYER_DRIFT_SEEK_SECONDS')) {
  failures.push('legacy fixed drift threshold is still present in WatchPartyPanel');
}

const actionTags = (panel.match(/commandKind: 'action'/g) ?? []).length;
const syncTags = (panel.match(/commandKind: 'sync'/g) ?? []).length;

if (actionTags < 2) {
  failures.push(`expected at least 2 authoritative action dispatches, found ${actionTags}`);
}

if (syncTags < 3) {
  failures.push(`expected at least 3 sync correction dispatches, found ${syncTags}`);
}

const onPlayerStateStart = panel.indexOf('function onPlayerState(event: Event)');
const onPlayerStateEnd = panel.indexOf(
  'function onPlayerAction(event: Event)',
  onPlayerStateStart,
);
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

  if (
    !onPlayerStateBlock.includes(
      'if (!semanticChange && !visiblePositionStep) return;',
    )
  ) {
    failures.push('high-frequency player state no longer has a React render throttle');
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(syncPolicy, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const now = 50_000;
    const cases = [
      {
        label: 'tiny drift is ignored',
        input: {
          localPositionSeconds: 100,
          remotePositionSeconds: 100.9,
          localPlaying: true,
          remotePlaying: true,
          lastCorrectionAt: 0,
          nowMs: now,
        },
        expected: 'none',
      },
      {
        label: 'play-state mismatch wins over position drift',
        input: {
          localPositionSeconds: 100,
          remotePositionSeconds: 100.2,
          localPlaying: false,
          remotePlaying: true,
          lastCorrectionAt: 0,
          nowMs: now,
        },
        expected: 'state',
      },
      {
        label: 'meaningful drift seeks when cooldown is clear',
        input: {
          localPositionSeconds: 100,
          remotePositionSeconds: 102.2,
          localPlaying: true,
          remotePlaying: true,
          lastCorrectionAt: 0,
          nowMs: now,
        },
        expected: 'seek',
      },
      {
        label: 'medium drift is suppressed during hysteresis cooldown',
        input: {
          localPositionSeconds: 100,
          remotePositionSeconds: 102.2,
          localPlaying: true,
          remotePlaying: true,
          lastCorrectionAt: now - 1_000,
          nowMs: now,
        },
        expected: 'none',
      },
      {
        label: 'critical drift overrides cooldown',
        input: {
          localPositionSeconds: 100,
          remotePositionSeconds: 107,
          localPlaying: true,
          remotePlaying: true,
          lastCorrectionAt: now - 1_000,
          nowMs: now,
        },
        expected: 'seek',
      },
    ];

    for (const testCase of cases) {
      const actual = runtime.decideWatchPartySync(testCase.input).kind;
      if (actual !== testCase.expected) {
        failures.push(
          `${testCase.label}: expected ${testCase.expected}, got ${actual}`,
        );
      }
    }
  } catch (error) {
    failures.push(
      `drift policy runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase D] Watch Together sync check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 21 Phase D] Watch Together authority, replay, drift and reconnect invariants passed.',
);
