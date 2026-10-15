const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('lib/episode-timeline-safety.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0, 'timeline safety must transpile');
const moduleRef = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)(
  () => { throw Error('unexpected runtime import'); }, moduleRef, moduleRef.exports,
);
const { endingPromptShouldShow } = moduleRef.exports;
assert.equal(typeof endingPromptShouldShow, 'function');

function timeline(ending, durationMs = 1_440_000, status = 'found') {
  return { animeId: 42, episode: 1, durationMs, ending, lookupStatus: status };
}
const valid = timeline({ startMs: 1_260_000, endMs: 1_430_000 });
const show = (time, data = valid, duration = 1440) =>
  endingPromptShouldShow({ timeline: data, observedDurationSeconds: duration, positionSeconds: time });

assert.equal(show(1259), false, 'before ending');
assert.equal(show(1260), true, 'valid ending after 60%');
assert.equal(show(1300), true, 'during ending');
assert.equal(show(120), false, 'rewind must hide prompt');
assert.equal(show(1439.8), false, 'actual end hides prompt');
assert.equal(show(1440), false, 'ended boundary hides prompt');
assert.equal(show(1300, valid, null), false, 'unknown actual duration fails closed');
assert.equal(show(1300, valid, 1200), false, 'timeline/provider duration mismatch');
assert.equal(show(200, timeline({startMs:115_200,endMs:200_000})),false, 'bad 8% marker cannot show');
assert.equal(show(1300, timeline({startMs:1_300_000,endMs:1_200_000})),false, 'inverted ending interval');
assert.equal(show(1300, timeline({startMs:1_300_000,endMs:1_500_000})),false, 'ending may not run past actual duration');
assert.equal(show(1300, timeline({startMs:1_260_000,endMs:1_430_000},1_440_000,'error')),false,'untrusted lookup status');
assert.equal(show(1430, null),true, 'missing marker uses observed final 10 seconds only');
assert.equal(show(500, null),false, 'missing marker cannot show early');
assert.equal(show(35, null, 50),false, 'short clip is not an episode ending');

const player = fs.readFileSync('components/AnimePlayer.tsx','utf8');
const mobileCss = fs.readFileSync('components/EpisodePageDensity.module.css','utf8');

assert(player.includes('skipOpeningVisible && !watchTogetherMode && !isKodik'),
  'Kodik must own its native skip-opening button');
assert(player.includes('endingPromptShouldShow({'), 'time samples must use safety decision');
assert(player.includes('setEndingPromptOpen((previous) =>'),
  'ending prompt must be reversible on every time sample');
assert(player.includes('setEndingPromptOpen(false);'),
  'manual seek/episode switch can dismiss existing ending hint');
assert(!player.includes('!endingPromptOpen &&\n        hasNext'),
  'old one-way ending trigger must be removed');
assert(player.includes('max-w-[60%]'), 'mobile ending hint must occupy at most 60% of viewport');
assert(player.includes('md:hidden">×</span>'), 'mobile close affordance remains visible');
assert(player.includes('data-player-action="theater"') &&
       player.includes('data-player-action="fullscreen"'),
  'toolbar actions need distinct semantic markers');
assert(player.includes('className="animebox-player-actions'),
  'desktop/mobile toolbar actions should share one container');
assert(mobileCss.includes(':global(.animebox-player-actions)') &&
       mobileCss.includes('grid-column: 1 / -1'),
  'mobile action group must span the row');
assert(mobileCss.includes("data-player-action='theater'][aria-pressed='false'"),
  'inactive cinema controls hidden on mobile, exit remains available');
assert(!mobileCss.includes(':global(.premium-player-dropdown) + :global(.premium-player-toolbar-button)'),
  'broken adjacent-grid positioning selector must be removed');
console.log('PASS player hotfix: ending safety, rewind, native skip ownership, compact hint, mobile actions grid.');
