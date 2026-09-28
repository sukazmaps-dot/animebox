import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const completion = read('lib/recommendation-completion.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');

for (const [label, source, needle] of [
  ['completion model', completion, 'scoreRecommendationCompletion'],
  ['completion version', completion, "RECOMMENDATION_COMPLETION_VERSION = '22.0-completion-v1'"],
  ['completion ranking weight', ranking, 'completionLikelihood: 0.18'],
  ['ranking completion signal', ranking, 'finite(signals.completionLikelihood) * weights.completionLikelihood'],
  ['recommendation completion model use', recommendations, 'const completionScore = scoreRecommendationCompletion({'],
  ['completion rank integration', recommendations, 'completionLikelihood: completionScore'],
  ['completion telemetry', personalization, 'completion_score: event.completionScore ?? null'],
  ['card completion attribution', card, 'completionScore,'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(completion, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const strong = runtime.scoreRecommendationCompletion({
      tastePositive: 0.9,
      tasteNegative: 0.05,
      completedAffinity: 0.85,
      episodeLengthAffinity: 1,
      communityQuality: 0.9,
      completionRate: 0.85,
      bingeScore: 0.7,
      finished: true,
      episodeCount: 12,
    }).score;

    const weak = runtime.scoreRecommendationCompletion({
      tastePositive: 0.15,
      tasteNegative: 0.8,
      completedAffinity: 0.1,
      episodeLengthAffinity: 0.1,
      communityQuality: 0.45,
      completionRate: 0.2,
      bingeScore: 0.1,
      finished: false,
      episodeCount: 100,
    }).score;

    if (strong <= weak || strong < 0.65) {
      failures.push(
        `strong continuation candidate must outrank weak one: strong=${strong}, weak=${weak}`,
      );
    }

    if (weak > 0.45) {
      failures.push(
        `weak continuation candidate is insufficiently bounded: ${weak}`,
      );
    }

    const bounded = runtime.scoreRecommendationCompletion({
      tastePositive: 10,
      tasteNegative: -10,
      completedAffinity: 10,
      episodeLengthAffinity: 10,
      communityQuality: 10,
      completionRate: 10,
      bingeScore: 10,
      finished: true,
      episodeCount: 1,
    }).score;

    if (bounded < 0 || bounded > 1) {
      failures.push(`completion score escaped 0..1 bounds: ${bounded}`);
    }
  } catch (error) {
    failures.push(
      `completion runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase C] Completion score check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase C] Completion-oriented ranking invariants passed.',
);
