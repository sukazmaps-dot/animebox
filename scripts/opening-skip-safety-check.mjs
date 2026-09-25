import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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
    'auto skip request uses strict policy',
    player,
    "mode === 'auto'\n          ? openingAutoSkipSafetyDecision({",
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
    'automatic skip uses a stricter policy',
    player,
    'openingAutoSkipSafetyDecision({',
  ],
  [
    'explicit seek auto-skip guard',
    player,
    'EXPLICIT_SEEK_AUTO_SKIP_GUARD_MS = 6_000',
  ],
  [
    'long-form automatic skip cutoff',
    safety,
    'MAX_AUTOMATIC_EPISODE_DURATION_SECONDS = 45 * 60',
  ],
  [
    'automatic jump hard cap',
    safety,
    'MAX_AUTOMATIC_OPENING_JUMP_SECONDS = 150',
  ],
  [
    'automatic opening ratio cap',
    safety,
    'MAX_AUTOMATIC_OPENING_SEGMENT_RATIO = 0.18',
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

if (!failures.length) {
  try {
    const compiledSafety = ts.transpileModule(safety, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiledSafety).toString('base64')}`
    );

    const timeline = ({ durationSeconds, opening, confidence = null }) => ({
      animeId: 1,
      episode: 1,
      durationMs: durationSeconds * 1000,
      opening:
        opening == null
          ? null
          : { startMs: opening[0] * 1000, endMs: opening[1] * 1000 },
      ending: null,
      recap: null,
      skipSource: 'aniskip',
      skipConfidence: confidence,
      lookupStatus: 'found',
      checkedAt: new Date(0).toISOString(),
    });

    const autoDecision = ({
      timelineDuration,
      observedDuration = timelineDuration,
      opening,
      position,
      confidence = null,
      recentExplicitSeek = false,
    }) =>
      runtime.openingAutoSkipSafetyDecision({
        timeline: timeline({
          durationSeconds: timelineDuration,
          opening,
          confidence,
        }),
        observedDurationSeconds: observedDuration,
        positionSeconds: position,
        recentExplicitSeek,
      });

    const cases = [
      {
        label: '12 minute episode keeps normal OP autoskip',
        decision: autoDecision({ timelineDuration: 12 * 60, opening: [30, 120], position: 31 }),
        safe: true,
        reason: 'ok',
      },
      {
        label: '24 minute episode keeps normal OP autoskip',
        decision: autoDecision({ timelineDuration: 24 * 60, opening: [60, 150], position: 61 }),
        safe: true,
        reason: 'ok',
      },
      {
        label: '45 minute episode is still eligible',
        decision: autoDecision({ timelineDuration: 45 * 60, opening: [60, 150], position: 61 }),
        safe: true,
        reason: 'ok',
      },
      {
        label: '60 minute episode requires manual skip',
        decision: autoDecision({ timelineDuration: 60 * 60, opening: [0, 90], position: 1 }),
        safe: false,
        reason: 'long_form_requires_manual_skip',
      },
      {
        label: '90 minute episode requires manual skip',
        decision: autoDecision({ timelineDuration: 90 * 60, opening: [0, 90], position: 1 }),
        safe: false,
        reason: 'long_form_requires_manual_skip',
      },
      {
        label: 'episode without OP never seeks',
        decision: autoDecision({ timelineDuration: 24 * 60, opening: null, position: 1 }),
        safe: false,
        reason: 'missing_opening',
      },
      {
        label: '24m metadata cannot drive a 60m playback timeline',
        decision: autoDecision({
          timelineDuration: 24 * 60,
          observedDuration: 60 * 60,
          opening: [0, 90],
          position: 1,
        }),
        safe: false,
        reason: 'duration_mismatch',
      },
      {
        label: 'manual seek into OP suppresses forced autoskip',
        decision: autoDecision({
          timelineDuration: 24 * 60,
          opening: [0, 90],
          position: 20,
          recentExplicitSeek: true,
        }),
        safe: false,
        reason: 'recent_explicit_seek',
      },
      {
        label: 'late entry into OP does not force a jump',
        decision: autoDecision({ timelineDuration: 24 * 60, opening: [0, 90], position: 45 }),
        safe: false,
        reason: 'entered_opening_too_late',
      },
      {
        label: 'short episode cannot lose a huge percentage to autoskip',
        decision: autoDecision({ timelineDuration: 5 * 60, opening: [0, 90], position: 1 }),
        safe: false,
        reason: 'opening_too_large_for_episode',
      },
      {
        label: 'automatic jump cannot exceed 150 seconds',
        decision: autoDecision({ timelineDuration: 30 * 60, opening: [0, 200], position: 1 }),
        safe: false,
        reason: 'automatic_jump_too_large',
      },
      {
        label: 'low-confidence metadata never forces a seek',
        decision: autoDecision({
          timelineDuration: 24 * 60,
          opening: [0, 90],
          position: 1,
          confidence: 0.4,
        }),
        safe: false,
        reason: 'low_confidence',
      },
    ];

    for (const testCase of cases) {
      if (
        testCase.decision.safe !== testCase.safe ||
        testCase.decision.reason !== testCase.reason
      ) {
        failures.push(
          `${testCase.label}: expected safe=${testCase.safe}, reason=${testCase.reason}; got safe=${testCase.decision.safe}, reason=${testCase.decision.reason}`,
        );
      }
    }

    const manualLongForm = runtime.openingSkipSafetyDecision({
      timeline: timeline({ durationSeconds: 60 * 60, opening: [0, 90] }),
      observedDurationSeconds: 60 * 60,
      requireObservedDuration: true,
    });

    if (!manualLongForm.safe) {
      failures.push(
        `60 minute manual opening skip should remain available, got ${manualLongForm.reason}`,
      );
    }
  } catch (error) {
    failures.push(
      `runtime safety matrix could not execute: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Opening Skip Safety] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Opening Skip Safety] strict auto-seek matrix passed for 12/24/45/60/90 minute runtimes.',
);
