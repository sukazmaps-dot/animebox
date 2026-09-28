import fs from 'node:fs';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const player = read('components/AnimePlayer.tsx');
const kodik = read('components/KodikPlayer.tsx');
const continuity = read('lib/playback-continuity.ts');

for (const [label, source, needle] of [
  ['player imports shared continuity guard', player, 'shouldAcceptAsyncResumeDecision'],
  ['player blocks late async resume mutation', player, 'selected: \'active_playback\''],
  ['native player uses shared threshold', player, 'ASYNC_RESUME_PLAYBACK_GUARD_SECONDS'],
  ['Kodik runtime reset keyed only by player identity', kodik, '}, [playerSrc]);'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (kodik.includes('}, [playerSrc, resumeSeconds]);')) {
  failures.push('Kodik runtime still resets when async resumeSeconds changes');
}

if (!continuity.includes("activeOrigin === 'source_switch'")) {
  failures.push('source-switch continuity override is not protected');
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(continuity, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const cases = [
      {
        label: 'idle player accepts async server resume',
        input: { observedPositionSeconds: 0, activeOrigin: 'local' },
        expected: true,
      },
      {
        label: 'small startup drift still accepts resume',
        input: { observedPositionSeconds: 5, activeOrigin: 'none' },
        expected: true,
      },
      {
        label: 'meaningful active playback rejects late resume',
        input: { observedPositionSeconds: 6, activeOrigin: 'server' },
        expected: false,
      },
      {
        label: 'source-switch continuity always wins over late API response',
        input: { observedPositionSeconds: 0, activeOrigin: 'source_switch' },
        expected: false,
      },
      {
        label: 'invalid observed position is treated as idle',
        input: { observedPositionSeconds: Number.NaN, activeOrigin: 'none' },
        expected: true,
      },
    ];

    for (const testCase of cases) {
      const actual = runtime.shouldAcceptAsyncResumeDecision(testCase.input);
      if (actual !== testCase.expected) {
        failures.push(
          `${testCase.label}: expected ${testCase.expected}, got ${actual}`,
        );
      }
    }
  } catch (error) {
    failures.push(
      `resume continuity runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase B] Resume continuity check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[AnimeBox Patch 21 Phase B] Resume/source continuity guard passed.');
