import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const intent = read('lib/recommendation-session-intent.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const explainability = read('lib/recommendation-explainability.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');

for (const [label, source, needle] of [
  ['session model', intent, 'buildRecommendationSessionIntent'],
  ['session affinity', intent, 'recommendationSessionIntentAffinity'],
  ['72h window', intent, 'windowHours: 72'],
  ['18h half-life', intent, 'halfLifeHours: 18'],
  ['bounded recent titles', intent, 'maxRecentTitles: 8'],
  ['ranking session weight', ranking, 'sessionIntent: 0.16'],
  ['ranking signal', ranking, 'finite(signals.sessionIntent) * weights.sessionIntent'],
  ['single session model build', recommendations, 'const sessionIntent = buildRecommendationSessionIntent(history)'],
  ['candidate session lookup', recommendations, 'recommendationSessionIntentAffinity('],
  ['explainable session reason', explainability, 'Похоже на то, что ты смотришь сейчас'],
  ['session telemetry score', personalization, 'session_intent_score: event.sessionIntentScore ?? null'],
  ['session telemetry confidence', personalization, 'session_intent_confidence: event.sessionIntentConfidence ?? null'],
  ['card session attribution', card, 'sessionIntentConfidence,'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(intent, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const now = 1_900_000_000_000;
    const hour = 60 * 60 * 1000;

    const empty = runtime.buildRecommendationSessionIntent([], now);
    if (empty.confidence !== 0 || empty.sampleSize !== 0) {
      failures.push(
        `empty history must have zero confidence, got ${empty.confidence}/${empty.sampleSize}`,
      );
    }

    const history = [
      {
        id: 1,
        genres: ['Psychological', 'Thriller'],
        episodes: 12,
        status: 'FINISHED',
        lastViewedAt: now - hour,
        viewCount: 4,
      },
      {
        id: 2,
        genres: ['Psychological', 'Mystery'],
        episodes: 13,
        status: 'FINISHED',
        lastViewedAt: now - hour * 5,
        viewCount: 3,
      },
      {
        id: 3,
        genres: ['Drama', 'Thriller'],
        episodes: 12,
        status: 'FINISHED',
        lastViewedAt: now - hour * 14,
        viewCount: 2,
      },
      {
        id: 4,
        genres: ['Comedy'],
        episodes: 100,
        status: 'RELEASING',
        lastViewedAt: now - hour * 90,
        viewCount: 10,
      },
    ];

    const model = runtime.buildRecommendationSessionIntent(history, now);
    if (model.sampleSize !== 3 || model.confidence <= 0.25) {
      failures.push(
        `recent session history was not modeled correctly: size=${model.sampleSize}, confidence=${model.confidence}`,
      );
    }

    if (
      model.preferredEpisodeCount == null ||
      model.preferredEpisodeCount < 11 ||
      model.preferredEpisodeCount > 14
    ) {
      failures.push(
        `preferred episode count is not recent-session bounded: ${model.preferredEpisodeCount}`,
      );
    }

    const matching = runtime.recommendationSessionIntentAffinity(
      {
        genres: ['Psychological', 'Thriller'],
        episodes: 12,
        status: 'FINISHED',
      },
      model,
    );

    const unrelated = runtime.recommendationSessionIntentAffinity(
      {
        genres: ['Comedy', 'Sports'],
        episodes: 100,
        status: 'RELEASING',
      },
      model,
    );

    if (matching <= unrelated || matching < 0.25) {
      failures.push(
        `session affinity must prefer current viewing intent: matching=${matching}, unrelated=${unrelated}`,
      );
    }

    const oldOnly = runtime.buildRecommendationSessionIntent(
      [{
        id: 9,
        genres: ['Action'],
        episodes: 24,
        status: 'FINISHED',
        lastViewedAt: now - hour * 100,
        viewCount: 5,
      }],
      now,
    );

    if (oldOnly.sampleSize !== 0 || oldOnly.confidence !== 0) {
      failures.push('history older than 72h leaked into current session intent');
    }
  } catch (error) {
    failures.push(
      `session intent runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase B] Session intent check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase B] Recent-session intent invariants passed.',
);
