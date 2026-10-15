const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = file => fs.readFileSync(file, 'utf8');
const detail = read('app/anime/[slug]/page.tsx');
const layout = read('app/anime/[slug]/detail-layout.module.css');
const personal = read('components/AnimePersonalPanel.module.css');
const rating = read('components/AnimeRatingControl.module.css');
const tracker = read('app/list/page.tsx');
const trackerCSS = read('app/tracker-library-compact.css');
const trackerResponsive = read('app/tracker-responsive-grid.css');
const homepage = read('components/HomeHeroCarousel.tsx');
const homepageCSS = read('app/patch30-0-home-streaming.css');
const mobileHome = read('app/patch29-1-home-mobile.css');
const pager = read('components/HomeHeroPagination.module.css');
const social = read('components/HomeHeroSocialLink.module.css');
const continueComponent = read('components/HomeContinueWatching.tsx');
const continueCSS = read('components/HomeContinueWatching.module.css');
const schedule = read('components/home/HomePersonalRetentionSections.tsx');
const plannedIcon = read('public/brand/icons/planned.svg');

assert(layout.includes('grid-template-columns: minmax(0, 680px)'),
  'right column must not push watch-together outside rating/library');
assert(layout.includes('.personal { display: grid; gap: 12px'), 'watch together aligned with personal stack');
assert(detail.includes('<Link className={layout.together}'), 'watch-together CTA retained');
assert(layout.includes('.finishedStatus') && detail.includes('finished ? ('),
  'completed titles should render passive semantic status, not inactive buttons');
assert(layout.includes('.aliases summary::after') &&
  layout.includes('.franchise > summary::after'), 'accordion indicators match');
assert(!layout.includes('.genres > a + a::before { content: \'•\''),
  'wrapped genre chips must not start with orphan separator');
assert(detail.includes('localizeDetailGenres(resolved.genres || [])'),
  'mixed English/Russian genres must canonicalize before displaying');
assert(!layout.includes('rgb(12 11 19'), 'mobile scrim must be theme-aware');
assert(layout.includes('padding: 146px 20px 20px'), 'mobile copy placed below faces');
assert(personal.includes('width: 100%') && rating.includes('width: min(100%, 440px)'),
  'rating must stay constrained and star grid consistent');
assert(!personal.includes('grid-template-columns: repeat(10'),
  'personal panel must not duplicate star grid implementation');

assert(!tracker.includes('ЛИЧНАЯ БИБЛИОТЕКА'),
  'no repetitive library eyebrow on each tracker item');
assert(trackerCSS.includes('min-height: 44px') && trackerCSS.includes('padding: 0;\n  overflow: visible;\n  border: 0;'),
  'tracker dropdown must have just one border');
assert(trackerResponsive.includes('.tracker-list--responsive > .tracker-card::before { content: none; }'),
  'tracker accent stripe must not be clipped');
assert(tracker.includes("item.progress.trackedEpisodes > 0"),
  'only show real watch progress');
assert(tracker.includes('Просмотр ещё не начат'), 'no fabricated progress for planned titles');
assert(plannedIcon.includes('L32 41') && !plannedIcon.includes('M32 14v36'),
  'planned status is not an add-plus icon');

assert(homepage.includes('anime.coverImage?.extraLarge,\n      anime.coverImage?.large'),
  'portrait poster must precede landscape mobile art');
assert(homepage.includes('anime.bannerImage,') && homepage.includes('media="(max-width: 768px)"'),
  'landscape image is mobile fallback, desktop art path retained');
assert(homepageCSS.includes('aspect-ratio: 2 / 3') &&
       homepageCSS.includes('width: min(42%, 200px)'),
  'mobile key art should be a properly proportioned 2:3 image');
assert(mobileHome.includes('-webkit-line-clamp: 2') &&
       mobileHome.includes('max-width: 80%'),
  'hero title cannot overlap whole poster');
assert(social.includes('@media (max-width: 768px) { .link { display: none; } }'),
  'third oversized mobile CTA removed while desktop link stays');
assert(pager.includes('background: color-mix') && pager.includes('min-width: 44px'),
  'hero pagination needs surface and accessible hit targets');
assert(!continueComponent.includes('styles.featured'),
  'continue-watching cards have consistent mobile and desktop markup');
assert(continueCSS.includes('border: 1px solid var(--ab-ui-border)'),
  'mobile cards use one border geometry');
assert(!continueCSS.includes('.featured'),
  'unused featured resume card styles must stay removed');
for(const selector of [
  '.section .card :global(.continue-smart-card__poster) {',
  '.section .card :global(.continue-smart-card__body) {',
  '.section .card :global(.continue-smart-card__arrow) {',
  '.section .card :global(.continue-smart-card__arrow)::after {',
]){
  assert(continueCSS.includes(selector), 'mobile card selector was accidentally concatenated: '+selector);
}
assert(!/:(?:global)\([^)]*\) :global\(\.continue-smart-card__/.test(continueCSS),
  'duplicate descendant global selectors disable card CSS');

assert(schedule.includes('if (personalScheduleItems.length === 0)'),
  'never render blank personalized schedule');

const compiled = ts.transpileModule(read('lib/anime-detail-genres.ts'), {
  fileName: 'lib/anime-detail-genres.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const exported = {exports:{}};
new Function('module','exports','require',compiled.outputText)(exported,exported.exports,name=>{
  if(name === '@/lib/anime-taxonomy') {
    const genres = {'Drama':['Drama','Драма'], 'Sci-Fi':['Sci-Fi','Фантастика']};
    return {
      findAnimeGenre: v=>Object.entries(genres).find(([,values])=>values.includes(v))
        ? {value:Object.entries(genres).find(([,values])=>values.includes(v))[0],label:v==='Drama'||v==='Драма'?'Драма':'Фантастика'}
        : undefined,
      findAnimeTag: ()=>undefined,
    };
  }
  throw Error(name);
});
const { localizeDetailGenres } = exported.exports;
assert.deepEqual(localizeDetailGenres(['Военное','Military','Космос','Space']).map(x=>x.label),
 ['Военное','Космос']);
assert.deepEqual(localizeDetailGenres(['Drama','Драма','Sci-Fi']).map(x=>x.label),
 ['Драма','Фантастика']);
assert.deepEqual(localizeDetailGenres(['Unknown','unknown','']).map(x=>x.label),['Unknown'],
 'unknown labels dedupe without guessed translations');
console.log('PASS 30.6 visual component contracts: detail, rating, tracker, localized genres, portrait hero, continue and schedule.');
