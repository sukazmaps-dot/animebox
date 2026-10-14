/**
 * Patch 29.14 — whole-page geometry matrix.
 * A: actual production Next guest /list and /settings HTML, offline.
 * B: source-equivalent controlled DOM for dynamic catalog, auth tracker,
 *    cinematic detail and public profile; these are NOT dynamic HTTP E2E.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const read = (p) => fs.readFile(p, 'utf8');

const widths = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
// Keep fixtures deterministic: no live accounts, provider access or mutations.

const animeTitle = 'Невероятное приключение героя в мире, где сезон продолжается и всё становится сложнее';
// Render the real AnimeCard component below, after reading its CSS Modules output.
const catalog = '<main class="search-page" data-fixture="catalog">' +
  '<div class="page-heading"><h1>Каталог аниме</h1><p>Ищи тайтлы по названию или жанру</p></div>' +
  '<div class="section"><div class="section-head"><h2>Результаты</h2></div>' +
  '<div class="anime-grid">%%ACTUAL_ANIME_CARDS%%</div></div></main>';

const trackerProgress = '<div class="tracker-card__progress mt-3 min-w-0 rounded-xl border border-[color-mix(in_srgb,var(--ab-ui-accent)_10%,transparent)] bg-[var(--ab-ui-primary)]/[0.035] p-3">' +
  '<div class="flex min-w-0 flex-wrap items-start justify-between gap-2"><div class="min-w-0">' +
  '<span class="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--ab-ui-muted)]" data-check="progress-label">Подтверждённый просмотр</span>' +
  '<strong class="mt-1 block min-w-0 break-words text-xs text-[var(--ab-ui-text)]" data-check="progress-title">Серия 123 — специальный дополнительный выпуск</strong>' +
  '</div><span class="shrink-0 text-[11px] font-bold text-[var(--ab-ui-accent)]" data-check="progress-count">123 / 999 серий</span></div>' +
  '<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ab-ui-border)]"><span class="block h-full rounded-full bg-gradient-to-r from-[var(--ab-ui-primary)] to-[var(--ab-ui-primary)]" style="width:65%"></span></div>' +
  '<a href="#" class="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--ab-ui-accent)_15%,transparent)] bg-[var(--ab-ui-primary)]/[0.07] px-3 text-[11px] font-bold text-[var(--ab-ui-accent)]">Продолжить · 12:34 →</a></div>';
const trackerCard = '<article class="tracker-card flex h-full min-w-0 flex-col" data-status="watching">' +
  '<div class="tracker-card__top"><div class="tracker-card__identity">' +
  '<div class="tracker-card__poster" aria-label="Обложка"><div class="tracker-card__poster-media"></div></div>' +
  '<div class="tracker-card__title"><span class="tracker-card__label">ЛИЧНАЯ БИБЛИОТЕКА</span>' +
  '<a href="#">' + animeTitle + '</a></div></div><div class="tracker-card__right shrink-0">' +
  '<a class="tracker-card__open" href="#">Открыть →</a></div></div>' +
  trackerProgress + '<div class="tracker-card__controls mt-auto"><button type="button">Смотрю</button></div></article>';
const tracker = '<main class="tracker-page tracker-page--fluid w-full min-w-0" data-fixture="tracker-auth-equivalent">' +
  '<header class="tracker-hero"><div class="tracker-hero__brand"><h1>Мой трекер</h1></div></header>' +
  '<nav class="tracker-filters" aria-label="Фильтр библиотеки"><button class="tracker-filter is-active">Все</button><button class="tracker-filter">Смотрю</button></nav>' +
  '<div class="tracker-list tracker-list--responsive grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">' +
  trackerCard.repeat(3) + '</div></main>';

const anime = '<main class="page_page anime-detail-v3 anime-detail-v4 min-h-screen overflow-hidden" data-fixture="anime-source">' +
  '<div class="detail_layout"><header class="detail_hero detail_withPoster"><div class="detail_poster">Обложка</div>' +
  '<div class="detail_heroContent"><div class="detail_identity"><h1>' + animeTitle + '</h1></div>' +
  '<div class="detail_facts"><span>2026</span><span>TV</span><span>24 серии</span></div>' +
  '<div class="detail_actions"><div class="controls_actions anime-detail-actions mt-7 flex flex-wrap gap-3">' +
  '<button class="btn btn--primary anime-detail-actions__watch">Продолжить просмотр · серия 123</button>' +
  '<button class="btn btn--ghost anime-detail-actions__favorite" aria-label="Избранное">♡</button>' +
  '<button class="btn btn--ghost anime-detail-actions__tracker" aria-label="Добавить">＋</button></div></div>' +
  '<section class="detail_description"><div class="synopsis_synopsis synopsis_hero">' +
  '<p class="synopsis_full">Длинное описание не должно накладываться на кнопки или исчезать при переносе. ' +
  'Умэ Мидзуноэ — первокурсник, который решает изменить привычный ход истории.</p></div></section>' +
  '</div></header><div class="detail_mainColumn"><section class="detail_episodes">Сезоны и эпизоды</section>' +
  '<section class="detail_secondary"><div class="detail_personal">Сохрани тайтл</div></section></div></div></main>';

const publicProfile = '<main class="profile-v2 profile-v2--public" data-fixture="profile-source">' +
  '<section class="profile-v2__hero"><div class="profile-v2__banner"><div class="profile-v2__banner-default"></div></div>' +
  '<div class="profile-v2__identity"><div class="profile-v2__avatar"><div class="profile-v2__avatar-image"></div></div>' +
  '<div class="profile-v2__identity-main"><div class="profile-v2__title-row"><div>' +
  '<div class="profile-v2__name-row"><h1>Исследователь AnimeBox — очень длинный никнейм участника</h1>' +
  '<span>LVL 250 · Легенда</span></div><p class="profile-v2__email">Публичный профиль AnimeBox</p></div>' +
  '<span class="profile-v2__public-badge">Участник сообщества</span></div>' +
  '<p class="profile-v2__bio">Биография участника достаточно длинная, чтобы проверить настоящий перенос ' +
  'текста на нескольких строках. Интересуется аниме, рекомендациями и сообществом.</p>' +
  '<div class="profile-v2__meta"><span>В AnimeBox с 2026 года</span></div>' +
  '<a href="#" class="btn btn--ghost">Добавить в друзья</a></div></div></section>' +
  '<section class="profile-v2__stats" aria-label="Публичная статистика">' +
  ['Просмотрено серий','Завершено тайтлов','Время просмотра','Комментарии'].map((label,i) =>
    '<article class="profile-v2__stat"><span class="profile-v2__stat-label">' + label +
    '</span><strong>' + ['1234','55','250 часов','89'][i] +
    '</strong><small>Данные плеера AnimeBox</small></article>').join('') +
  '</section><section class="profile-v2__achievements"><h2>Достижения</h2></section></main>';

function rectOf(element) {
  const r = element.getBoundingClientRect();
  return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
}
function colorContrast(rgbA, rgbB) {
  const convert = (value) => {
    const array = String(value).match(/[\d.]+/g);
    assert(array && array.length >= 3, 'Not an RGB color: ' + value);
    return array.slice(0,3).map(Number).map(v => {
      v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
    }).reduce((v,n,i)=>v+n*[0.2126,0.7152,0.0722][i],0);
  };
  const a=convert(rgbA),b=convert(rgbB);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
async function scopedCSS(file,prefix) {
  const content=await read(file);
  const result=await postcss([local(),scope({generateScopedName: name => prefix+'_'+name})]).process(content,{from:file});
  result.root.walkRules(':export',r=>r.remove());
  return result.css;
}

(async () => {
  const cssDir='.next/static/chunks';
  const chunks=(await fs.readdir(cssDir)).filter(name=>name.endsWith('.css'));
  assert(chunks.length,'Production build CSS chunks required; run after npm run build');
  const css=(await Promise.all(chunks.map(name=>read(path.join(cssDir,name))))).join('\n');
  // Same real React component rendering as page-consistency-smoke. The previous
  // hand-written card omitted AnimeCardContent's wrapper and falsified geometry.
  const cardCSS=css.includes('AnimeCardContent-module')?css:null;
  assert(cardCSS,'Production build does not contain AnimeCardContent CSS');
  const matched=cardCSS.match(/\.(AnimeCardContent-module__[\w]+__content)/);
  assert(matched,'AnimeCardContent CSS Module class unavailable');
  const prefix=matched[1].replace(/content$/,'');
  const cardStyles=Object.fromEntries(['content','poster','inline','media','details'].map(key=>[key,prefix+key]));
  async function compile(file,imports){
    const mod={exports:{}};
    const transformed=ts.transpileModule(await read(file),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
    }).outputText;
    new Function('require','exports','module',transformed)(
      name=>name==='react/jsx-runtime'?require(name):imports[name],mod.exports,mod
    );
    return mod.exports;
  }
  const cardContent=await compile('components/AnimeCardContent.tsx',{
    './AnimeCardContent.module.css':{default:cardStyles}
  });
  const animeCard=await compile('components/AnimeCard.tsx',{
    '@/components/AnimeCardContent':cardContent,
    'next/link':{default:({prefetch,...props})=>React.createElement('a',props)},
    '@/components/AnimeImage':{default:({alt,className})=>React.createElement('img',{src:'/brand/brand-mark.webp',alt,className})},
    '@/lib/anime-url':{animeHref:anime=>'/anime/'+anime.id},
    '@/lib/anime-display':{getAnimeTitle:anime=>anime.title.russian,isAnimeOngoing:()=>false},
  });
  const item={id:101,title:{russian:animeTitle},genres:[],score:9.2,format:'TV',episodes:24,startDate:{year:2026}};
  const realCard=renderToStaticMarkup(React.createElement(animeCard.default,{anime:item}));
  const catalogWithRealCards=catalog.replace('%%ACTUAL_ANIME_CARDS%%',realCard.repeat(8));
  const modules=await Promise.all([
    scopedCSS('app/anime/[slug]/page.module.css','page'),
    scopedCSS('app/anime/[slug]/detail-layout.module.css','detail'),
    scopedCSS('components/AnimeDetailControls.module.css','controls'),
    scopedCSS('components/AnimeSynopsis.module.css','synopsis'),
  ]);
  const assetsStyle=css+'\n'+modules.join('\n');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH}: {})});
  let cases=0;
  try {
    const context=await browser.newContext();
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='animebox.test')return route.abort();
      if(url.pathname==='/list'||url.pathname==='/settings') {
        const file='.next/server/app/'+url.pathname.slice(1)+'.html';
        return route.fulfill({contentType:'text/html',body:await fs.readFile(file)});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'offline fixture'}});
      if(route.request().resourceType()==='script')return route.abort();
      const isStatic=url.pathname.startsWith('/_next/static/');
      const base=isStatic?'.next/static':'public';
      const rel=isStatic?url.pathname.slice('/_next/static/'.length):url.pathname.slice(1);
      const resolved=path.resolve(base,rel);
      if(!resolved.startsWith(path.resolve(base)+path.sep))return route.abort();
      try {
        const body=await fs.readFile(resolved);
        const mime=resolved.endsWith('.css')?'text/css':resolved.endsWith('.webp')?'image/webp':
          resolved.endsWith('.png')?'image/png':resolved.endsWith('.svg')?'image/svg+xml':
          resolved.endsWith('.woff2')?'font/woff2':'application/octet-stream';
        return route.fulfill({body,contentType:mime});
      } catch {return route.abort();}
    });
    const page=await context.newPage();
    await page.emulateMedia({reducedMotion:'reduce'});
    // ACTUAL: HTML from a built public route, not an invented component.
    for(const name of ['/list','/settings']) {
      await page.goto('http://animebox.test'+name,{waitUntil:'load'});
      const main=page.locator('.page-content');
      assert(await main.count(),name+': real page-content unavailable');
      const text=await main.innerText();
      assert(text.trim().length>0,name+': real built route has no content');
      if(name==='/list')assert(await page.locator('.tracker-page').count(), 'Built /list missing tracker component');
      for(const {width,height} of widths)for(const theme of ['dark','light']) {
        await page.setViewportSize({width,height});
        await page.evaluate(t=>{document.documentElement.dataset.animeboxTheme=t;},theme);
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        const m=await page.evaluate(()=>{
          const el=document.querySelector('.page-content'),r=el.getBoundingClientRect();
          const shell=document.querySelector('.app-shell');
          const shellCss=getComputedStyle(shell);
          return {x:r.x,right:r.right,width:r.width,page:document.documentElement.scrollWidth,vw:innerWidth,
            mediaMobile:matchMedia('(max-width: 768px)').matches,
            shellMargin:shellCss.marginLeft, shellWidth:shellCss.width,
            sidebar:getComputedStyle(document.querySelector('.sidebar')).display};
        });
        assert(m.width>100&&m.x>=-1&&m.right<=width+1,name+'/'+theme+'/'+width+': actual page-content clipped: '+JSON.stringify(m));
        assert(m.page<=m.vw+1,name+'/'+theme+'/'+width+': actual built route overflow');
        cases++;
      }
    }
    // SOURCE-EQUIVALENT: actual stylesheet + explicit deterministic route DOM.
    await page.goto('http://animebox.test/list',{waitUntil:'load'});
    await page.addStyleTag({content:assetsStyle});
    for(const [name,markup] of [['catalog',catalogWithRealCards],['tracker-auth',tracker],['anime',anime],['public-profile',publicProfile]]) {
      await page.locator('.page-content').evaluate((el,html)=>{el.innerHTML=html;},markup);
      assert(await page.locator('[data-fixture]').count(),name+': fixture failed to mount');
      for(const {width,height} of widths)for(const theme of ['dark','light']) {
        await page.setViewportSize({width,height});
        await page.evaluate(t=>{document.documentElement.dataset.animeboxTheme=t;},theme);
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        const result=await page.evaluate((kind)=>{
          const root=document.querySelector('[data-fixture]');
          const r=el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
          const cards=[...root.querySelectorAll('.anime-card,.tracker-card,.profile-v2__stat')].map(r);
          const marker=root.querySelector('.detail_actions');
          const copy=root.querySelector('.detail_description');
          const watch=root.querySelector('.anime-detail-actions__watch');
          const title=root.querySelector('.profile-v2__name-row h1');
          const hero=root.querySelector('.profile-v2__hero');
          const contrast=[...root.querySelectorAll('[data-check]')].map(el=>{
            const css=getComputedStyle(el);
            const panel=root.querySelector('.tracker-card');
            const parentColor=panel?getComputedStyle(panel).backgroundColor:getComputedStyle(document.body).backgroundColor;
            const toRGB=value=>{const temp=document.createElement('span');temp.style.backgroundColor=value;document.body.appendChild(temp);
              const out=getComputedStyle(temp).backgroundColor;temp.remove();return out;};
            return {name:el.dataset.check,color:css.color,background:parentColor,
              surface:toRGB('var(--ab-ui-surface)')};
          });
          return {root:r(root),cards,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
            actions:marker&&r(marker),description:copy&&r(copy),watch:watch&&r(watch),
            title:title&&r(title),hero:hero&&r(hero),contrast};
        },name);
        const tag=name+'/'+theme+'/'+width;
        assert(result.root.width>0&&result.root.left>=-1&&result.root.right<=width+1,tag+': root outside viewport: '+JSON.stringify(result.root));
        assert(result.pageWidth<=width+1,tag+': horizontal document overflow: '+result.pageWidth);
        for(const box of result.cards) {
          assert(box.width>20&&box.height>20&&box.left>=-1&&box.right<=width+1,tag+': card clipped: '+JSON.stringify(box));
        }
        if(name==='catalog') {
          assert.equal(result.cards.length,8,tag+': catalog fixture cards missing');
          const art=await page.locator('.anime-card__image-wrap').first().boundingBox();
          assert(art&&art.height>0&&Math.abs(art.width/art.height-2/3)<0.04,tag+': poster ratio');
        }
        if(name==='tracker-auth') {
          assert.equal(result.cards.length,3,tag+': tracker fixture cards missing');
          for(const item of result.contrast) {
            const ratio=colorContrast(item.color,item.surface);
            assert(ratio>=4.5,tag+': '+item.name+' contrast '+ratio.toFixed(2)+' (<4.5)');
          }
          const resume=await page.locator('.tracker-card__progress a').first().boundingBox();
          assert(resume&&resume.height>=44,tag+': resume touch action too short');
        }
        if(name==='anime') {
          assert(result.actions&&result.description&&result.watch,tag+': cinematic action/description missing');
          assert(result.description.top>=result.actions.bottom+1,tag+': synopsis overlaps actions');
          if(width<=767)assert(result.watch.height>=48,tag+': mobile watch action too short');
        }
        if(name==='public-profile') {
          assert(result.title&&result.hero,tag+': public profile hero missing');
          assert(result.title.left>=-1&&result.title.right<=width+1,tag+': username overflows viewport');
          for(let i=0;i<result.cards.length;i++)for(let j=i+1;j<result.cards.length;j++){
            const a=result.cards[i],b=result.cards[j];
            const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
            const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
            assert(!(overlapX>4&&overlapY>4),tag+': public stats cards overlap');
          }
        }
        cases++;
      }
    }
    console.log('[Patch 29.14] PASS '+cases+' route/theme/viewport cases: actual guest SSR (/list,/settings) + clearly identified source-layout fixtures (catalog, tracker auth, anime and public profile).');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
