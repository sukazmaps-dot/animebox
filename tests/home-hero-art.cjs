const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, imports = {}) {
  const module = {exports:{}};
  const {outputText} = ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  });
  new Function('module','exports','require',outputText)(module,module.exports,name => {
    if (name in imports) return imports[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    throw Error('Unexpected import: '+name);
  });
  return module.exports;
}
const {mobileHeroObjectPosition:position} = load('lib/home-hero-art.ts');
const {mergeAnimeMetadata:merge} = load('lib/anime-metadata-merge.ts');
const anime = {id:1,title:{russian:'Тест'},genres:[]};
assert.equal(position(anime),'50% 20%');
for (const point of [null,{}, {x:NaN,y:20},{x:50,y:Infinity},{x:'10',y:20}]) {
  assert.equal(position({...anime,mobileHeroPosition:point}),'50% 20%');
}
assert.equal(position({...anime,mobileHeroPosition:{x:-20,y:130}}),'0% 100%');
assert.equal(position({...anime,mobileHeroPosition:{x:62.5,y:15}}),'62.5% 15%');
const fallback = {...anime,mobileHeroImage:'https://example.org/a.jpg',mobileHeroPosition:{x:60,y:10}};
assert.deepEqual(merge(anime,fallback).mobileHeroPosition,{x:60,y:10});
assert.equal(merge({...anime,mobileHeroImage:'https://example.org/b.jpg'},fallback).mobileHeroPosition,undefined);
assert.deepEqual(merge({...anime,mobileHeroImage:fallback.mobileHeroImage},fallback).mobileHeroPosition,{x:60,y:10});
assert.deepEqual(merge({...anime,mobileHeroPosition:{x:30,y:40}},fallback).mobileHeroPosition,{x:30,y:40});
console.log('PASS mobile art focal points and metadata merge preserve artwork-coordinate ownership.');

// Render the real carousel on the server: its data/markup must remain usable
// without hydration, fabricated facts, or a second mobile image.
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const media = load('lib/media-delivery.ts');
const imageService = load('lib/image-service.ts', {'@/lib/media-delivery':media});
const taxonomy = load('lib/anime-taxonomy.ts');
const Hero = load('components/HomeHeroCarousel.tsx', {
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  'next/image':{default:({fill,priority,unoptimized,fetchPriority,...props})=>React.createElement('img',props)},
  'next/navigation':{useRouter:()=>({push:()=>{throw Error('SSR navigation');}})},
  '@/components/HomeHeroSocialLink.module.css':{default:{link:'social'}},
  '@/components/HomeHeroFacts.module.css':{default:{facts:'facts',score:'score'}},
  '@/components/HomeHeroPagination':{default:()=>null},
  '@/components/Icon':{default:()=>null},
  '@/lib/anime-url':{animeHref:()=>'/anime/test',animeWatchHref:()=>'/anime/test/watch'},
  '@/lib/image-service':imageService,
  '@/lib/media-delivery':media,
  '@/lib/anime-display':load('lib/anime-display.ts'),
  '@/lib/anime-score':load('lib/anime-score.ts'),
  '@/lib/anime-detail-genres':load('lib/anime-detail-genres.ts',{'@/lib/anime-taxonomy':taxonomy}),
  '@/lib/home-hero-art':{mobileHeroObjectPosition:position},
}).default;
const render = item=>renderToStaticMarkup(React.createElement(Hero,{popular:[item],ongoing:[]}));
let html=render(anime);
assert(!html.includes('class="facts"'),'missing data must not create an empty facts row');
assert(!html.includes('<img'),'no images must retain a text-only hero');
assert(html.includes('/anime/test/watch')&&html.includes('Подробнее'),'media-free hero retains actions');
html=render({...fallback,score:0,averageScore:100,startDate:{year:2026},genres:['Adventure']});
assert(html.includes('Приключения')&&html.includes('★ 10.0')&&html.includes('2026'),'real facts use shared normalization');
assert(html.includes('50% 20%')===false,'curated position must not be replaced with default');
html=render({...anime,score:NaN,startDate:{year:Infinity},genres:['Неизвестный жанр'],coverImage:{large:'https://example.org/cover.jpg'},mobileHeroImage:'https://example.org/curated.jpg'});
assert(!html.includes('Рейтинг:'),'invalid score hidden');
assert(html.includes('Неизвестный жанр'),'unknown genre retained');
assert.equal((html.match(/<img /g)||[]).length,1,'one image for all media');
assert(/media="\(max-width: 768px\)"[^>]+curated/.test(html),'curated art selected before cover in actual picture');
assert(!html.includes('42vw'),'responsive sizes must match full hero width');
console.log('PASS actual carousel SSR: curated picture source, normalized/missing facts, unknown genre, image-free recovery and actions.');
