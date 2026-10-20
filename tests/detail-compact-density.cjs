const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const read = p => fs.readFileSync(p,'utf8');
const route = read('app/anime/[slug]/page.tsx');
const layout = read('app/anime/[slug]/detail-layout.module.css');
const episodes = read('components/CinematicEpisodeList.module.css');
const rating = read('components/AnimeRatingControl.tsx');
const ratingCSS = read('components/AnimeRatingControl.module.css');
const panelCSS = read('components/AnimePersonalPanel.module.css');

assert(route.includes('<AnimeRatingControl animeId={numericId} variant="compact" />'), 'detail must opt in to rating disclosure');
assert(route.includes('<AnimePersonalPanel animeHref={animeHref(resolved)}>'), 'guest login and current library state retained');
assert(route.includes('<EpisodeList trackingAnimeId={numericId}'), 'availability-gated episode list retained');
assert(route.includes('variant="cinematic"'), 'only cinematic list is redesigned');
assert(route.includes('href="/watch-together"'), 'together route retained');
assert(route.includes('playbackRestricted ? layout.solo'), 'restricted title layout remains single column');
assert(route.includes('sources={posterSources}'), 'poster cascade retained independently of backdrop');
assert(layout.includes('min-height: 328px') && layout.includes('width: 192px'), 'desktop compact hero geometry');
assert(layout.includes('max-width: calc(100% - 244px)'), 'hero text reserves poster slot');
assert(episodes.includes('min-height: 64px') && episodes.includes('grid-template-columns: 44px'), 'unframed episode surface size');
assert(episodes.includes('.media { grid-template-columns: 96px'), 'real episode thumbnail keeps its own variant');
assert(episodes.includes('.grid { display: grid; grid-template-columns: repeat(2'), 'desktop 2-column episodes');
assert(ratingCSS.includes('.compactDisclosure') && ratingCSS.includes('.compactSummary') && ratingCSS.includes('min-height: 44px'), 'compact rating accessible summary');
assert(panelCSS.includes("data-rating-compact='true'"), 'rating uses existing sidebar style owner');
for(const token of ["'/api/community/rating'", "'DELETE'", 'method: \'POST\'', 'Array.from({ length: 10 }', "variant = 'default'"]) {
  assert(rating.includes(token), 'rating behavior must remain unchanged: '+token);
}

const styles = new Proxy({}, {get:(_obj,key)=>String(key)});
const loadRating = () => {
  const mod = {exports:{}};
  const transpiled = ts.transpileModule(rating,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',transpiled)((name)=>{
    if(name==='next/link') return {default:props=>React.createElement('a',props)};
    if(name==='next/navigation') return {usePathname:()=>'/anime/test'};
    if(name==='@/components/AuthStateProvider') return {useAuthState:()=>({user:null,loading:false})};
    if(name==='./AnimeRatingControl.module.css') return {default:styles};
    return require(name);
  },mod,mod.exports);
  return mod.exports.default;
};
const Component=loadRating();
const compact=renderToStaticMarkup(React.createElement(Component,{animeId:42,variant:'compact'}));
const ordinary=renderToStaticMarkup(React.createElement(Component,{animeId:42}));
assert(compact.includes('data-rating-compact="true"'));
assert(compact.includes('data-rating-disclosure=""'));
assert(compact.includes('<summary') && compact.includes('Моя оценка') && compact.includes('Оценить /10'));
assert(!/<details[^>]*\bopen=/.test(compact), 'compact rating must initially be closed');
assert.equal((compact.match(/aria-label="Поставить \d+ из 10"/g)||[]).length,10, 'all ten score actions retained on disclosure');
assert(!ordinary.includes('data-rating-disclosure') && ordinary.includes('Как тебе этот тайтл?'),'default rating remains expanded');
assert.equal((ordinary.match(/aria-label="Поставить \d+ из 10"/g)||[]).length,10);
console.log('PASS compact detail: poster/episode/library/WT contracts, native rating disclosure and intact 1–10 controls');
