import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const graphSource = read('lib/taste-graph.ts');
const tasteRoute = read('app/api/recommendations/taste/route.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const community = read('lib/community-server.ts');
const migration = read(
  'supabase/migrations/20260929014500_patch22_taste_graph7_metadata.sql',
);

for (const [label, source, needle] of [
  ['Taste Graph version', graphSource, "TASTE_GRAPH_VERSION = 'taste-v7'"],
  ['Taste Graph cache version', graphSource, "animebox:taste-graph:v7"],
  ['studio weights', graphSource, 'studioWeights: Record<string, number>'],
  ['negative studio weights', graphSource, 'negativeStudioWeights: Record<string, number>'],
  ['format weights', graphSource, 'formatWeights: Record<string, number>'],
  ['era weights', graphSource, 'eraWeights: Record<string, number>'],
  ['finished preference', graphSource, 'finishedPreference: number | null'],
  ['metadata coverage', graphSource, 'metadataCoverage: TasteMetadataCoverage'],
  ['studio affinity helper', graphSource, 'animeStudioAffinity'],
  ['format affinity helper', graphSource, 'animeFormatAffinity'],
  ['era affinity helper', graphSource, 'animeEraAffinity'],
  ['status affinity helper', graphSource, 'animeFinishedAffinity'],
  ['server catalog metadata select', tasteRoute, "select('id,genres,studios,format,start_year,total_episodes,finished')"],
  ['server studio vector', tasteRoute, 'const studioWeights = normalizeWeights(studioPositive)'],
  ['server format vector', tasteRoute, 'const formatWeights = normalizeWeights(formatPositive)'],
  ['server era vector', tasteRoute, 'const eraWeights = normalizeWeights(eraPositive)'],
  ['server status vector', tasteRoute, 'const finishedPreference ='],
  ['metadata coverage server', tasteRoute, 'const metadataCoverage = {'],
  ['catalog studios column', migration, 'add column if not exists studios text[]'],
  ['catalog format column', migration, 'add column if not exists format text'],
  ['catalog year column', migration, 'add column if not exists start_year smallint'],
  ['metadata version column', migration, 'recommendation_metadata_version smallint not null default 0'],
  ['metadata version write', community, 'recommendation_metadata_version: 1'],
  ['legacy metadata enrichment', community, 'Number(row.recommendation_metadata_version ?? 0) < 1'],
  ['studio persistence', community, 'studios: ['],
  ['format persistence', community, 'format: format ? format.slice(0, 32) : null'],
  ['year persistence', community, 'start_year:'],
  ['ranking studio affinity', recommendations, 'const graphStudioAffinity = animeStudioAffinity(anime, tasteGraph)'],
  ['ranking format affinity', recommendations, 'const formatAffinity = animeFormatAffinity(anime, tasteGraph)'],
  ['ranking era affinity', recommendations, 'const eraAffinity = animeEraAffinity(anime, tasteGraph)'],
  ['ranking status affinity', recommendations, 'const statusAffinity = animeFinishedAffinity(finished, tasteGraph)'],
  ['negative metadata rank signal', ranking, 'metadataNegativeAffinity: 0.16'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(graphSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const rawGraph = {
      version: 'taste-v7',
      generatedAt: new Date(1_900_000_000_000).toISOString(),
      confidence: 0.8,
      sampleSize: 30,
      completedEpisodes: 120,
      completionRate: 0.75,
      bingeScore: 0.55,
      preferredEpisodeCount: 12,
      averageRating: 8.4,
      ratingsCount: 20,
      explorationRate: 0.12,
      moodWeights: { tension: 0.8 },
      signalBreakdown: {
        library: 20,
        completedTitles: 12,
        completedEpisodes: 120,
        recommendationEvents: 30,
        explicitFeedback: 5,
        ratings: 20,
      },
      genreWeights: { psychological: 1 },
      negativeGenreWeights: { sports: 0.7 },
      completedGenreWeights: { thriller: 0.9 },
      studioWeights: { madhouse: 1, bones: 0.6 },
      negativeStudioWeights: { genericstudio: 0.7 },
      formatWeights: { tv: 1, movie: 0.45 },
      negativeFormatWeights: { music: 0.8 },
      eraWeights: { '2010s': 1, '2020s': 0.7 },
      negativeEraWeights: { '1990s': 0.6 },
      finishedPreference: 0.8,
      metadataCoverage: {
        studios: 24,
        formats: 28,
        years: 27,
        statuses: 30,
      },
      excludedAnimeIds: [],
      completedAnimeIds: [],
      droppedAnimeIds: [],
      likedAnimeIds: [],
      ratedAnimeIds: [],
      highRatedAnimeIds: [],
      lowRatedAnimeIds: [],
      explicitFeedbackCount: 5,
      topGenres: ['psychological'],
    };

    const graph = runtime.sanitizeTasteGraph(rawGraph);
    if (!graph || graph.version !== 'taste-v7') {
      failures.push('Taste Graph 7 sanitizer rejected valid graph');
    } else {
      if (graph.studioWeights.madhouse !== 1) {
        failures.push('studio weights were not preserved by sanitizer');
      }
      if (graph.formatWeights.tv !== 1) {
        failures.push('format weights were not preserved by sanitizer');
      }
      if (graph.eraWeights['2010s'] !== 1) {
        failures.push('era weights were not preserved by sanitizer');
      }
      if (graph.finishedPreference !== 0.8) {
        failures.push(`finished preference was not preserved: ${graph.finishedPreference}`);
      }

      const studioStrong = runtime.animeStudioAffinity(
        { studios: [{ name: 'Madhouse' }] },
        graph,
      );
      const studioWeak = runtime.animeStudioAffinity(
        { studios: [{ name: 'Unknown Studio' }] },
        graph,
      );
      if (studioStrong.positive <= studioWeak.positive || studioStrong.positive < 0.5) {
        failures.push(
          `studio affinity is not discriminative: strong=${studioStrong.positive}, weak=${studioWeak.positive}`,
        );
      }

      const format = runtime.animeFormatAffinity(
        { format: 'TV', kind: null },
        graph,
      );
      if (format.positive < 0.9) {
        failures.push(`format affinity unexpectedly weak: ${format.positive}`);
      }

      const era = runtime.animeEraAffinity(
        { startDate: { year: 2016 } },
        graph,
      );
      if (era.bucket !== '2010s' || era.positive < 0.9) {
        failures.push(
          `era affinity failed: bucket=${era.bucket}, positive=${era.positive}`,
        );
      }

      const finished = runtime.animeFinishedAffinity(true, graph);
      const ongoing = runtime.animeFinishedAffinity(false, graph);
      if (finished <= ongoing || finished !== 0.8) {
        failures.push(
          `finished-vs-ongoing preference failed: finished=${finished}, ongoing=${ongoing}`,
        );
      }
    }

    if (runtime.tasteEraBucket(2004) !== '2000s') {
      failures.push('era bucket mapping for 2004 is incorrect');
    }
    if (runtime.tasteEraBucket(2026) !== '2020s') {
      failures.push('era bucket mapping for 2026 is incorrect');
    }
    if (runtime.tasteEraBucket(1800) !== null) {
      failures.push('invalid historical year escaped era bounds');
    }

    const legacy = runtime.sanitizeTasteGraph({
      ...rawGraph,
      version: 'taste-v6',
    });
    if (legacy !== null) {
      failures.push('Taste Graph v6 must not be accepted as v7 cache data');
    }
  } catch (error) {
    failures.push(
      `Taste Graph 7 runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase D] Taste Graph 7 check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase D] Taste Graph 7 metadata, enrichment and affinity invariants passed.',
);
