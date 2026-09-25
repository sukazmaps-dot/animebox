import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const resumePolicy = read('lib/resume-integrity.ts');
const watchProgress = read('lib/watch-progress.ts');
const watchServer = read('lib/watch-server.ts');
const watchSession = read('components/useWatchSession.ts');
const player = read('components/AnimePlayer.tsx');
const directPlayer = read('components/DirectVideoPlayer.tsx');
const telegramBridge = read('components/TelegramMiniAppBridge.tsx');

const failures = [];

for (const [label, source, needle] of [
  ['client near-end guard', watchProgress, 'Math.min(20, Math.max(6, durationSeconds * 0.04))'],
  ['heartbeat canonical resume', watchServer, 'const resumePositionMs = canonicalResumePositionMs({'],
  ['heartbeat writes canonical resume', watchServer, 'resume_position_ms: resumePositionMs'],
  ['end canonical resume', watchServer, 'const canonicalPositionMs = canonicalResumePositionMs({'],
  ['completed-aware end resume', watchServer, 'completed: Boolean(progressResult.data?.completed_at)'],
  ['session lifecycle generation', watchSession, 'lifecycleGenerationRef'],
  ['generation-owned send lock', watchSession, 'sendingGenerationRef.current === generation'],
  ['monotonic client completion', watchSession, 'completedRef.current || Boolean(input.completed)'],
  ['stale start response shield', watchSession, 'generation !== lifecycleGenerationRef.current'],
  ['stale heartbeat session shield', watchSession, 'sessionRef.current !== requestSessionId'],
  ['foreground visibility sync', watchSession, "document.visibilityState === 'hidden'"],
  ['pageshow progress recovery', watchSession, "window.addEventListener('pageshow', onPageShow)"],
  ['resume merge policy', player, 'chooseResumeCandidate({'],
  ['native resume re-arm', player, 'resumeAppliedRef.current = target <= 0'],
  ['source-switch resume origin', player, "'source_switch'"],
  ['mobile native selector', player, 'className="absolute inset-0 z-[60] h-11 w-full cursor-pointer opacity-0 sm:hidden"'],
  ['Telegram foreground viewport recovery', player, 'syncAfterForeground'],
  ['Telegram viewport event recovery', player, "telegram?.onEvent?.('viewportChanged', syncPlayerViewport)"],
  ['Telegram safe right metric', telegramBridge, "'--animebox-tg-safe-right'"],
  ['Telegram safe left metric', telegramBridge, "'--animebox-tg-safe-left'"],
  ['fullscreen safe bottom', directPlayer, 'var(--animebox-tg-safe-bottom, 0px)'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (
  !watchServer.includes("const completedAt = progress?.completed_at ||") ||
  !watchServer.includes('completed: Boolean(completedAt)')
) {
  failures.push('completed watch state is no longer sticky');
}

if (
  !watchServer.includes(".is('ended_at', null)") ||
  !watchServer.includes('if (endedSession?.id && session?.episode_id && positionMs != null)')
) {
  failures.push('superseded session end can overwrite newer progress');
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(resumePolicy, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const minute = 60_000;
    const duration = 24 * minute;

    const cases = [
      {
        label: 'ordinary mid-episode resume survives',
        value: runtime.canonicalResumePositionMs({
          positionMs: 8 * minute,
          durationMs: duration,
          completed: false,
        }),
        expected: 8 * minute,
      },
      {
        label: 'near-end resume is cleared',
        value: runtime.canonicalResumePositionMs({
          positionMs: duration - 10_000,
          durationMs: duration,
          completed: false,
        }),
        expected: 0,
      },
      {
        label: 'completed episode resume is always cleared',
        value: runtime.canonicalResumePositionMs({
          positionMs: 8 * minute,
          durationMs: duration,
          completed: true,
        }),
        expected: 0,
      },
    ];

    for (const testCase of cases) {
      if (testCase.value !== testCase.expected) {
        failures.push(
          `${testCase.label}: expected ${testCase.expected}, got ${testCase.value}`,
        );
      }
    }

    const nowMs = Date.parse('2026-09-25T18:00:00.000Z');
    const choose = (overrides = {}) =>
      runtime.chooseResumeCandidate({
        serverCompleted: false,
        serverUsable: true,
        serverPositionSeconds: 300,
        serverUpdatedAt: nowMs - 120_000,
        localUsable: true,
        localPositionSeconds: 360,
        localUpdatedAt: nowMs - 30_000,
        nowMs,
        ...overrides,
      });

    const localNewer = choose();
    if (
      localNewer.source !== 'local_newer' ||
      localNewer.positionSeconds !== 360 ||
      !localNewer.localWins
    ) {
      failures.push(
        `plausible local-newer merge failed: ${JSON.stringify(localNewer)}`,
      );
    }

    const serverNewer = choose({
      serverUpdatedAt: nowMs - 10_000,
      localUpdatedAt: nowMs - 30_000,
    });
    if (serverNewer.source !== 'server' || serverNewer.localWins) {
      failures.push(
        `server-newer merge failed: ${JSON.stringify(serverNewer)}`,
      );
    }

    const futureSkew = choose({
      localUpdatedAt: nowMs + 5 * minute,
    });
    if (futureSkew.source !== 'server') {
      failures.push(
        `future-skew local journal defeated server: ${JSON.stringify(futureSkew)}`,
      );
    }

    const implausiblyAhead = choose({
      serverUpdatedAt: nowMs - 2 * 60 * minute,
      localUpdatedAt: nowMs - 5_000,
    });
    if (implausiblyAhead.source !== 'server') {
      failures.push(
        `clock-skew window failed: ${JSON.stringify(implausiblyAhead)}`,
      );
    }

    const localOnly = choose({
      serverUsable: false,
      serverPositionSeconds: 0,
    });
    if (localOnly.source !== 'local' || !localOnly.localWins) {
      failures.push(
        `local crash-journal fallback failed: ${JSON.stringify(localOnly)}`,
      );
    }

    const completed = choose({ serverCompleted: true });
    if (
      completed.source !== 'completed' ||
      completed.positionSeconds !== 0 ||
      completed.localWins
    ) {
      failures.push(
        `completed resume merge failed: ${JSON.stringify(completed)}`,
      );
    }
  } catch (error) {
    failures.push(
      `resume runtime matrix could not execute: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.4.2 Mobile + Resume Integrity] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.4.2 Mobile + Resume Integrity] canonical resume, generation ownership, mobile controls and foreground recovery matrix passed.',
);
