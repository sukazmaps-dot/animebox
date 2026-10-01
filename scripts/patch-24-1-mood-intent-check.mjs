import fs from 'node:fs';
import ts from 'typescript';

const failures = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const mustInclude = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label);
};

const moods = read('lib/recommendation-moods.ts');
const scorer = read('lib/recommendation-mood-score.ts');
const picker = read('components/HomeMoodPicker.tsx');
const runtime = read('components/home/useHomeRecommendationRuntime.ts');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const recs = read('lib/recommendations.ts');
const rails = read('lib/recommendation-rails.ts');
const feed = read('components/SmartRecommendationFeed.tsx');
const api = read('app/api/recommendations/route.ts');
const types = read('types/recommendations.ts');

for (const mood of ['comfort', 'tension', 'emotion', 'adventure']) {
  mustInclude(moods, `${mood}:`, `missing central mood definition: ${mood}`);
}

mustInclude(moods, 'primaryTags', 'mood tags are not centralized');
mustInclude(moods, 'negativeTags', 'negative mood evidence is missing');
mustInclude(moods, 'getMoodRetrievalTarget', 'mood retrieval target helper missing');

mustInclude(scorer, 'scoreRecommendationMood', 'mood scorer missing');
mustInclude(scorer, "anchorCount === 0", 'broad-only mood cap missing');
mustInclude(scorer, "tier === 'strong' || result.tier === 'good'", 'strict mood tier contract missing');

mustInclude(picker, 'HOME_MOOD_OPTIONS', 'picker does not use central mood definitions');
mustInclude(runtime, 'recommendationMood', 'runtime does not separate selected and rendered mood');
mustInclude(runtime, "intent: 'mood'", 'runtime does not bootstrap mood-focused candidates');
mustInclude(runtime, 'setMoodSwitching(true)', 'runtime mood transition state missing');
mustInclude(discovery, 'mood={recommendationMood}', 'feed still receives selected mood before ranked items');

mustInclude(recs, 'scoreRecommendationMood', 'ranking does not use mood scorer');
mustInclude(recs, 'moodScore:', 'ranked recommendations do not expose mood score');
mustInclude(recs, 'moodTier:', 'ranked recommendations do not expose mood tier');

mustInclude(rails, "'mood_lane'", 'mood rail missing');
mustInclude(rails, "item.moodTier === 'strong'", 'mood rail is not strict');
mustInclude(rails, 'moodPool', 'mood rail is not mood-first ranked');

mustInclude(feed, "intent: mood === 'any' ? 'default' : 'mood'", 'feed cache context does not isolate mood intent');
mustInclude(feed, "params.set('intent', context.intent)", 'feed does not request mood intent');

mustInclude(api, "type CandidateIntent = 'default' | 'mood'", 'candidate intent contract missing');
mustInclude(api, 'getMoodRetrievalTarget', 'API does not use mood retrieval targets');
mustInclude(api, "intent === 'mood'", 'API does not prioritize mood candidate sources');
mustInclude(types, "intent?: 'default' | 'mood'", 'recommendation page intent type missing');

if (!failures.length) {
  try {
    const moodRuntimeSource = moods
      .replace(
        /import type \{ TasteMood \} from '@\/lib\/personalization';\n/,
        '',
      );

    const scorerRuntimeSource = scorer
      .replace(
        /import type \{ TasteMood \} from '@\/lib\/personalization';\n/,
        '',
      )
      .replace(
        /import \{[\s\S]*?\} from '@\/lib\/recommendation-moods';\n/,
        '',
      )
      .replace(
        /import type \{ Anime \} from '@\/types\/anime';\n/,
        '',
      );

    const compiled = ts.transpileModule(
      `${moodRuntimeSource}\n${scorerRuntimeSource}`,
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const anime = (genres, tags = []) => ({
      id: Math.max(1, genres.length + tags.length),
      title: { english: 'Fixture' },
      genres,
      tags,
    });

    const broadOnly = [
      ['tension', anime(['Action'])],
      ['emotion', anime(['Romance'])],
      ['comfort', anime(['Comedy'])],
    ];

    for (const [mood, fixture] of broadOnly) {
      const result = runtime.scoreRecommendationMood(fixture, mood);
      if (result.tier === 'strong' || result.tier === 'good') {
        failures.push(
          `broad-only ${fixture.genres[0]} incorrectly qualifies as ${mood}: ${result.score}`,
        );
      }
    }

    const strongFixtures = [
      ['comfort', anime(['Slice of Life'], ['Iyashikei'])],
      ['tension', anime(['Mystery'], ['Detective'])],
      ['emotion', anime(['Drama'], ['Coming of Age'])],
      ['adventure', anime(['Adventure'], ['Isekai'])],
    ];

    for (const [mood, fixture] of strongFixtures) {
      const result = runtime.scoreRecommendationMood(fixture, mood);
      if (result.tier !== 'strong') {
        failures.push(
          `anchored mood fixture is not strong for ${mood}: ${result.score} / ${result.tier}`,
        );
      }
    }

    const comfortConflict = runtime.scoreRecommendationMood(
      anime(['Slice of Life', 'Horror'], ['Iyashikei', 'Gore']),
      'comfort',
    );
    if (comfortConflict.score >= 0.72) {
      failures.push('negative mood evidence no longer suppresses conflicting comfort candidates');
    }
  } catch (error) {
    failures.push(
      `mood scorer runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('Patch 24.1 Mood Intent check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Patch 24.1 Mood Intent check passed.');
