/* Real image components + shared recovery hook/observer with a virtual clock.
 * No outbound requests. Failures, cached loads and visibility are controlled. */
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const originalNow = Date.now;
let now = 1_000, sequence = 0, revision = 0, blocked = false;
Date.now = () => now;
const timers = new Map(), observers = [], healthListeners = new Set();
const winEvents = new EventTarget(), docEvents = new EventTarget();
const setTimer = (fn, delay) => {const id=++sequence;timers.set(id,{fn,at:now+delay});return id;};
const clearTimer = id=>timers.delete(id);
global.window = {
  innerWidth:1200,innerHeight:800,setTimeout:setTimer,clearTimeout:clearTimer,
  requestAnimationFrame:fn=>setTimer(fn,0),cancelAnimationFrame:clearTimer,
  addEventListener:winEvents.addEventListener.bind(winEvents),removeEventListener:winEvents.removeEventListener.bind(winEvents),
};
global.document = {visibilityState:'visible',
  addEventListener:docEvents.addEventListener.bind(docEvents),removeEventListener:docEvents.removeEventListener.bind(docEvents)};
Object.defineProperty(global,'navigator',{value:{onLine:true},configurable:true});
global.IntersectionObserver = class {
  constructor(callback,options) {this.callback=callback;this.options=options;this.targets=new Set();observers.push(this);}
  observe(target) {this.targets.add(target);}
  unobserve(target) {this.targets.delete(target);}
  disconnect() {this.targets.clear();this.disconnected=true;}
};
const media='https://media.test/image?url=https%3A%2F%2Forigin.test%2Fa.jpg';
const proxy='/api/image?url=https%3A%2F%2Forigin.test%2Fa.jpg';
const direct='https://origin.test/a.jpg', alternate='https://other.test/a.jpg';
const base=[media,proxy,direct,alternate];
const setFor=src=>src.startsWith('https://media.')?src+' 360w':undefined;
const mocks={
  '@/lib/image-service':{
    getImageCandidates:image=>image?.candidates??[],getImageMediaSrcSet:image=>setFor(image?.candidates?.[0]??''),
    getImageCandidateMediaSrcSet:setFor,buildImageCandidateChain:sources=>sources,
    getRawImageMediaSrcSet:sources=>setFor(sources[0]??''),
  },
  '@/lib/media-edge-health-client':{
    getMediaEdgeRetryAfterMs:()=>0,getMediaEdgeHealthRevision:()=>revision,getMediaEdgeHealthServerRevision:()=>0,
    isMediaEdgeBlocked:src=>blocked&&src.startsWith('https://media.'),isAnimeBoxMediaRequest:src=>src.startsWith('https://media.'),
    reportMediaEdgeFailure() {},reportMediaEdgeSuccess() {},
    subscribeMediaEdgeHealth:fn=>{healthListeners.add(fn);return()=>healthListeners.delete(fn);},
  },
};
const modules=new Map();
function load(file) {
  if(modules.has(file))return modules.get(file);
  const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>mocks[name]??(name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name)),mod,mod.exports);
  modules.set(file,mod.exports);return mod.exports;
}
const Image=load('components/AnimeImage.tsx').default;
const Cascade=load('components/AnimeImageCascade.tsx').default;
async function advance(ms) {
  const until=now+ms;
  for(let n=0;n<100;n++) {
    const next=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next){now=until;return;}
    now=next[1].at;timers.delete(next[0]);await act(async()=>next[1].fn());
  }
  throw Error('Unbounded recovery timers');
}
function viewportObserver() {return observers.findLast(o=>o.options.rootMargin==='0px'&&!o.disconnected);}
async function visible(value=true) {
  const observer=viewportObserver();assert(observer,'pending images need one viewport observer');
  await act(async()=>observer.callback([...observer.targets].map(target=>({target,isIntersecting:value}))));
}
let tree, cached=false;
const props=(extra={})=>({image:{candidates:base},loading:'lazy',...extra});
const image=()=>tree.root.findByType('img');
const host=()=>tree.root.findByProps({'data-image-delivery':'animebox-media'});
const state=()=>host().props['data-image-state'];
async function mount(Component=Image,input=props()) {
  now += 120_001; // Unrelated cases start beyond the bounded session hint TTL.
  await act(async()=>{tree=create(React.createElement(Component,input),{createNodeMock:el=>el.type==='img'
    ? {complete:cached,naturalWidth:cached?600:0,naturalHeight:cached?900:0}
    : {getBoundingClientRect:()=>({top:10,bottom:210,left:10,right:160})}});});
}
async function loaded() {await act(async()=>image().props.onLoad({currentTarget:{naturalWidth:600,naturalHeight:900}}));}
async function unmount() {await act(async()=>tree.unmount());assert.equal(timers.size,0,'unmount cancels all scheduled work');}
(async()=>{
  await mount();
  assert.equal(image().props.loading,'lazy');
  await advance(60_000);assert.equal(image().props.src,media,'offscreen native lazy must never time out');
  await visible();assert.equal(image().props.loading,'eager','visible lazy request is explicitly released');
  await advance(6_499);assert.equal(image().props.src,media);
  await advance(1);assert.equal(image().props.src,proxy,'stalled visible request moves to independent proxy');
  assert.equal(host().props['data-image-last-failure-reason'],'timeout');
  await advance(9_500);assert.equal(image().props.src,direct);
  await advance(7_500);assert.equal(image().props.src,alternate);
  await advance(500);assert.equal(state(),'fallback','one pass is capped at 24 seconds of visible foreground time');
  assert.equal(host().props['data-image-request-state'],'exhausted');
  await unmount();

  await mount();await visible();await advance(3_000);
  document.visibilityState='hidden';await act(async()=>docEvents.dispatchEvent(new Event('visibilitychange')));
  await advance(60_000);assert.equal(image().props.src,media,'background time cannot fail a valid source');
  document.visibilityState='visible';await act(async()=>docEvents.dispatchEvent(new Event('visibilitychange')));
  await advance(3_499);assert.equal(image().props.src,media);
  await advance(1);assert.equal(image().props.src,proxy,'source timeout resumes with its remaining time');
  await unmount();

  await mount();await visible();await advance(2_000);await visible(false);
  await advance(30_000);assert.equal(image().props.src,media);
  await visible();await advance(4_500);assert.equal(image().props.src,proxy,'scroll-away pauses the source budget');
  await unmount();

  await mount(Image,props({format:'auto'}));await loaded();
  const source=image().props.src, srcset=image().props.srcSet;
  await act(async()=>tree.update(React.createElement(Image,props({image:{candidates:[...base,'https://extra.test/a.jpg']},format:'auto'}))));
  assert.equal(image().props.src,source);assert.equal(state(),'loaded','new fallback metadata preserves a decoded poster');
  assert.equal(timers.size,0,'retained success does not start another watchdog');
  blocked=true;revision++;await act(async()=>healthListeners.forEach(fn=>fn()));
  assert.equal(image().props.srcSet,srcset,'other failing posters cannot rewrite a loaded picture srcset');
  assert.equal(tree.root.findAllByType('source').length,2,'loaded picture format sources are retained during edge cooldown');
  blocked=false;await unmount();

  blocked=true;await mount();assert.equal(image().props.src,proxy);
  blocked=false;revision++;await act(async()=>healthListeners.forEach(fn=>fn()));
  assert.equal(image().props.src,proxy,'cooldown expiry cannot rewind an active independent recovery request');
  await unmount();

  const hints=load('lib/image-recovery-session.ts');
  hints.rememberImageSuccess(base,proxy);
  const {renderToStaticMarkup}=require('react-dom/server');
  assert(renderToStaticMarkup(React.createElement(Image,props())).includes(`src="${media}"`),
    'SSR ignores tab memory and emits deterministic primary markup');
  // Mount without advancing the virtual clock: this is a return to the title.
  await act(async()=>{tree=create(React.createElement(Image,props()),{createNodeMock:el=>el.type==='img'
    ?{complete:false}:{getBoundingClientRect:()=>({top:10,bottom:100,left:10,right:100})}});});
  assert.equal(image().props.src,proxy,'returning card reuses its recently working delivery source after hydration');
  await act(async()=>image().props.onError());
  assert.equal(image().props.src,direct,'a failed remembered source advances normally');
  assert.equal(hints.rememberedImageSource(base),-1,'failure invalidates the hint');
  await unmount();
  hints.rememberImageSuccess(base,proxy);now+=120_001;
  assert.equal(hints.rememberedImageSource(base),-1,'successful delivery hints expire');
  for(let i=0;i<129;i++)hints.rememberImageSuccess(['source-'+i,'fallback-'+i],'fallback-'+i);
  assert.equal(hints.rememberedImageSource(['source-0','fallback-0']),-1,'session hints have a hard entry bound');
  assert.equal(hints.rememberedImageSource(['source-128','fallback-128']),1);

  await mount();const oldLoad=image().props.onLoad, oldError=image().props.onError;
  await act(async()=>tree.update(React.createElement(Image,props({image:{candidates:['https://origin.test/b.jpg']}}))));
  assert.match(image().props.src,/b.jpg$/);assert.equal(state(),'loading');
  await act(async()=>tree.update(React.createElement(Image,props())));
  await act(async()=>oldLoad({currentTarget:{naturalWidth:600,naturalHeight:900}}));
  assert.equal(state(),'loading','A -> B -> A rejects completion from the first A generation');
  await act(async()=>oldError());
  assert.equal(host().props['data-image-last-failure-reason'],undefined,'stale failures cannot poison current diagnostics or edge health');
  await loaded();assert.equal(state(),'loaded');await unmount();

  cached=true;await mount();await advance(0);assert.equal(state(),'loaded','cached decoded image becomes visible without a new onLoad');
  cached=false;await unmount();
  await mount(Image,props({image:null}));
  assert.equal(host().props['data-image-request-state'],'missing-source','missing URL is distinguishable from delivery failure');
  await unmount();

  await mount(Cascade,{sources:base,loading:'lazy'});await advance(60_000);assert.equal(image().props.src,media);
  await visible();await advance(8_500);assert.equal(image().props.src,proxy,'detail cascade recovers visible native-lazy stalls too');
  await loaded();
  await act(async()=>tree.update(React.createElement(Cascade,{sources:[...base,'https://extra.test/a.jpg'],loading:'lazy'})));
  assert.equal(image().props.src,proxy);assert.equal(state(),'loaded','cascade keeps a loaded alternate when metadata changes');
  await unmount();

  // Two pending posters share one observer. The final subscriber releases it.
  const before=observers.filter(o=>o.options.rootMargin==='0px').length;
  await act(async()=>{tree=create(React.createElement('section',null,[1,2].map(id=>React.createElement(Image,{key:id,...props()}))),{
    createNodeMock:el=>el.type==='img'?{complete:false}:{getBoundingClientRect:()=>({top:10,bottom:100,left:10,right:100})},
  });});
  assert.equal(observers.filter(o=>o.options.rootMargin==='0px').length,before+1);
  assert.equal(viewportObserver().targets.size,2);
  await unmount();assert.equal(viewportObserver(),undefined);
  assert.equal(healthListeners.size,0);

  // Older WebViews without IntersectionObserver keep native lazy scheduling,
  // then activate recovery from one shared RAF/scroll visibility fallback.
  global.IntersectionObserver=undefined;
  await mount();await advance(0);
  assert.equal(image().props.loading,'eager');
  await advance(6_500);assert.equal(image().props.src,proxy);
  await unmount();

  // Render real catalog/top card consumers. A non-null but empty coverImage
  // must not hide a valid legacy poster or drop an independent fallback URL.
  let delivered;
  mocks['@/components/AnimeImage']={__esModule:true,default:({image})=>{delivered=image;return null;}};
  mocks['@/components/AnimeIntentLink']={__esModule:true,default:({children})=>React.createElement('a',null,children)};
  mocks['@/components/AnimeCardContent']={__esModule:true,default:({media,children})=>React.createElement(React.Fragment,null,media,children)};
  mocks['@/lib/anime-url']={animeHref:()=>'/anime/test'};
  mocks['@/lib/anime-display']={getAnimeTitle:()=> 'Test',isAnimeOngoing:()=>false};
  mocks['@/lib/anime-score']={formatAnimeScore:()=>null};
  mocks['@/lib/anime-content-intelligence']={animeEpisodesDisplay:()=>null};
  const legacyAnime={id:1,title:{romaji:'Test'},genres:[],coverImage:{large:''},image:{large:direct}};
  const copy=structuredClone(legacyAnime);
  for(const file of ['components/AnimeCard.tsx','components/TopAnimeItem.tsx']) {
    const Card=load(file).default;
    renderToStaticMarkup(React.createElement(Card,{anime:legacyAnime,rank:1}));
    assert.equal(delivered.large,direct,'legacy poster reaches the actual consumer: '+file);
    renderToStaticMarkup(React.createElement(Card,{anime:{...legacyAnime,coverImage:{large:alternate}},rank:1}));
    assert.equal(delivered.large,alternate);assert(delivered.fallbackUrls.includes(direct));
  }
  assert.deepEqual(legacyAnime,copy,'poster source merging cannot mutate cached metadata');
  console.log('PASS visible poster recovery: lazy stalls, foreground budgets, tab/scroll pause, loaded continuity, stale generations, srcsets, cached decode and shared cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Date.now=originalNow;});
