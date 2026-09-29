import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const franchise = read('lib/recommendation-franchise.ts');
const recommendations = read('lib/recommendations.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const rails = read('lib/recommendation-rails.ts');
const personalization = read('lib/personalization.ts');
const diversity = read('lib/recommendation-diversity.ts');
const card = read('components/SmartRecommendationCard.tsx');

for (const [label, source, needle] of [
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.1-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.1-v1'"],
  ['franchise history index', franchise, 'buildRecommendationFranchiseHistoryIndex'],
  ['franchise prerequisite gate', franchise, 'blockedByPrerequisite'],
  ['franchise family dedupe', franchise, 'dedupeFranchiseRecommendationFamilies'],
  ['ranking continuation signal', ranking, 'franchiseContinuation: 0.24'],
  ['recommendation continuation score', recommendations, 'franchiseContinuation: franchise.continuationScore'],
  ['recommendation prerequisite filter', recommendations, 'if (franchise.blockedByPrerequisite) return null'],
  ['continuation reason', recommendations, 'Продолжение тайтла, который ты уже смотрел'],
  ['story rail id', rails, "'story_continues'"],
  ['story rail title', rails, "title: 'История продолжается'"],
  ['diversity canonical family', diversity, 'item.franchiseFamilyKey?.trim()'],
  ['continuation not exploration', diversity, 'if (item.franchiseContinuation) return false'],
  ['event continuation field', personalization, 'franchiseContinuation?: boolean'],
  ['event season field', personalization, 'franchiseSeasonNumber?: number'],
  ['product continuation metadata', personalization, 'franchise_continuation: event.franchiseContinuation ?? null'],
  ['card continuation attribution', card, 'franchiseContinuation,'],
  ['card season attribution', card, 'franchiseSeasonNumber: franchiseSeasonNumber ?? undefined'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(franchise, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const anime = (id, title) => ({
      id,
      title: { english: title },
      genres: [],
    });

    const history = [
      anime(1, 'Attack on Titan Season 1'),
      anime(10, 'Example Saga Part 1'),
    ];

    const index = runtime.buildRecommendationFranchiseHistoryIndex(history);

    const seasonTwo = runtime.recommendationFranchiseSignal(
      anime(2, 'Attack on Titan Season 2'),
      index,
    );
    if (!seasonTwo.continuation || seasonTwo.blockedByPrerequisite) {
      failures.push('exact next season was not recognized as a continuation');
    }

    const seasonThree = runtime.recommendationFranchiseSignal(
      anime(3, 'Attack on Titan Season 3'),
      index,
    );
    if (!seasonThree.blockedByPrerequisite || seasonThree.continuation) {
      failures.push('season 3 escaped the missing-season-2 prerequisite gate');
    }

    const coldSeasonTwo = runtime.recommendationFranchiseSignal(
      anime(20, 'Unknown Show Season 2'),
      index,
    );
    if (!coldSeasonTwo.blockedByPrerequisite) {
      failures.push('cold-start sequel was allowed without previous-season evidence');
    }

    const partTwo = runtime.recommendationFranchiseSignal(
      anime(11, 'Example Saga Part 2'),
      index,
    );
    if (!partTwo.continuation || partTwo.continuationScore < 0.8) {
      failures.push('next split-cour/part was not recognized as continuation');
    }

    const deduped = runtime.dedupeFranchiseRecommendationFamilies([
      {
        anime: anime(30, 'Demo Season 1'),
        franchiseFamilyKey: 'demo',
        franchiseContinuation: false,
      },
      {
        anime: anime(31, 'Demo Season 2'),
        franchiseFamilyKey: 'demo',
        franchiseContinuation: true,
      },
      {
        anime: anime(40, 'Other'),
        franchiseFamilyKey: 'other',
        franchiseContinuation: false,
      },
    ]);

    if (
      deduped.length !== 2 ||
      deduped[0]?.anime?.id !== 31 ||
      !deduped[0]?.franchiseContinuation
    ) {
      failures.push('family dedupe did not preserve the continuation candidate');
    }
  } catch (error) {
    failures.push(
      `franchise runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase E] Franchise intelligence check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase E] Franchise prerequisite, continuation and rail invariants passed.',
);
