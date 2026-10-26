'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

const anime = { id: 42, slug: 'fixture', providerSeason: 1 };
const canonical = 'https://fixture.test/anime/fixture/episode/1';
let releaseIndexability;
let indexabilityCalls = 0;
let indexEntryReads = 0;
let timelineReads = 0;
let structuredDataCalls = 0;
let shouldIndex = true;
let lastStructuredDataArgs = null;

const pendingIndexability = new Promise(resolve => {
  releaseIndexability = resolve;
});

const indexEntry = {
  firstAvailableAt: '2026-01-01T00:00:00.000Z',
  thumbnailUrl: 'https://fixture.test/episode-thumb.webp',
};
const videoMeta = {
  durationMs: 60000,
  contentUrl: 'https://fixture.test/episode.mp4',
  playerUrl: 'https://fixture.test/embed/episode',
};

const mocks = {
  'next/navigation': {
    notFound() { throw Error('Unexpected notFound'); },
    permanentRedirect() { throw Error('Unexpected redirect'); },
  },
  '@/components/AnimeEpisodePage': { default: function Player() {} },
  '@/lib/anime-seo': {
    getAnimeSeoIdentity: () => ({ pageHeading: 'Fixture' }),
    shouldIndexAnime: () => shouldIndex,
  },
  '@/lib/anime-route': { resolveAnimeRoute: async () => anime },
  '@/lib/anime-url': { animeHref: () => '/anime/fixture' },
  '@/lib/episode-seo': {
    isEpisodeIndexable: () => {
      indexabilityCalls += 1;
      return pendingIndexability;
    },
    buildEpisodeVideoStructuredData: (...args) => {
      structuredDataCalls += 1;
      lastStructuredDataArgs = args;
      return {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: '<Fixture>',
        canonical: args[2],
      };
    },
  },
  '@/lib/seo-config': { SITE_URL: 'https://fixture.test' },
  '@/lib/seo-episode-index': {
    getSeoEpisodeIndexEntry: async () => {
      indexEntryReads += 1;
      return indexEntry;
    },
  },
  '@/lib/episode-timeline-server': {
    getEpisodeTimelineForSeo: async () => {
      timelineReads += 1;
      return videoMeta;
    },
  },
  '@/lib/copyright-server': { getPlaybackRestriction: async () => null },
};

const sourcePath = 'app/anime/[slug]/episode/[episode]/page.tsx';
const code = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  fileName: sourcePath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(
  mod,
  mod.exports,
  id => {
    if (mocks[id]) return { __esModule: true, ...mocks[id] };
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    throw Error('Unexpected import ' + id);
  },
);

async function main() {
  // A bounded wait converts a regression back to blocking SEO into a clear test failure.
  let timeout;
  const pagePromise = mod.exports.default({
    params: Promise.resolve({ slug: 'fixture', episode: '1' }),
  });
  const page = await Promise.race([
    pagePromise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('EpisodePage waited for optional SEO before returning')),
        750,
      );
    }),
  ]).finally(() => clearTimeout(timeout));

  const children = React.Children.toArray(page.props.children);
  const player = children.find(
    child => child.type === mocks['@/components/AnimeEpisodePage'].default,
  );
  assert(player, 'player must be returned before optional SEO resolves');

  const boundary = children.find(child => child.type === React.Suspense);
  assert(boundary, 'VideoObject must have its own Suspense boundary');
  assert.equal(boundary.props.fallback, null);

  const breadcrumbScript = children.find(
    child => child.type === 'script' &&
      child.props.type === 'application/ld+json',
  );
  assert(breadcrumbScript, 'breadcrumb JSON-LD must remain on the main route');
  const breadcrumbText = breadcrumbScript.props.dangerouslySetInnerHTML.__html;
  const breadcrumb = JSON.parse(breadcrumbText);
  assert.equal(breadcrumb['@type'], 'BreadcrumbList');
  assert.equal(
    breadcrumb.itemListElement[2].item,
    canonical,
    'breadcrumb canonical must identify the requested episode',
  );
  assert(!breadcrumbText.includes('<Fixture>'), 'breadcrumb JSON-LD must escape <');

  assert.equal(indexabilityCalls, 0, 'parent page must not await SEO indexability');
  assert.equal(indexEntryReads, 0, 'parent page must not read the SEO registry');
  assert.equal(timelineReads, 0, 'parent page must not read SEO video metadata');

  const seoElement = boundary.props.children;
  const seoPromise = seoElement.type(seoElement.props);
  assert.equal(indexabilityCalls, 1);
  assert.equal(indexEntryReads, 0, 'registry reads wait for indexability');
  assert.equal(timelineReads, 0, 'timeline reads wait for indexability');

  releaseIndexability(true);
  const videoScript = await seoPromise;
  assert(videoScript, 'confirmed, indexable episode should receive VideoObject JSON-LD');
  assert.equal(videoScript.type, 'script');
  assert.equal(videoScript.props.type, 'application/ld+json');

  const videoText = videoScript.props.dangerouslySetInnerHTML.__html;
  assert.equal(JSON.parse(videoText).name, '<Fixture>');
  assert.equal(JSON.parse(videoText).canonical, canonical);
  assert(!videoText.includes('<Fixture>'), 'VideoObject JSON-LD must escape <');

  assert.equal(indexEntryReads, 1);
  assert.equal(timelineReads, 1);
  assert.equal(structuredDataCalls, 1);
  assert.equal(lastStructuredDataArgs[0], anime);
  assert.equal(lastStructuredDataArgs[1], 1);
  assert.equal(lastStructuredDataArgs[2], canonical);
  assert.deepEqual(lastStructuredDataArgs[3], {
    uploadDate: indexEntry.firstAvailableAt,
    durationMs: videoMeta.durationMs,
    contentUrl: videoMeta.contentUrl,
    embedUrl: videoMeta.playerUrl,
    thumbnailUrl: indexEntry.thumbnailUrl,
  });

  // When indexing is not allowed, do not run availability, registry or timeline lookups.
  shouldIndex = false;
  const indexabilityCallsBefore = indexabilityCalls;
  const indexReadsBefore = indexEntryReads;
  const timelineReadsBefore = timelineReads;
  const skipped = await seoElement.type(seoElement.props);
  assert.equal(skipped, null);
  assert.equal(indexabilityCalls, indexabilityCallsBefore);
  assert.equal(indexEntryReads, indexReadsBefore);
  assert.equal(timelineReads, timelineReadsBefore);
  assert.equal(structuredDataCalls, 1, 'no VideoObject should be built for non-indexable anime');

  console.log(
    'PASS episode route returns player before optional SEO; canonical and JSON-LD safety stay intact; non-indexable anime skips SEO lookups.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
