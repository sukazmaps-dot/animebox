/** Actual pagination component + source-equivalent hero shell, offline Chromium.
 * This is not a hydrated autoplay/swipe E2E test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const read = file => fs.readFileSync(file, 'utf8');
const files = [
  ...[...read('app/layout.tsx').matchAll(/import '\.\/([^']+\.css)'/g)].map(m => 'app/' + m[1]),
  ...[...read('app/page.tsx').matchAll(/import '\.\/([^']+\.css)'/g)].map(m => 'app/' + m[1]),
];
const globalCSS = files.map(file => read(file).replace(/@import[^;]+;/g, '')).join('\n');
const classes = Object.fromEntries(['pagination','counter','positions','position','mark'].map(n => [n,'hero_'+n]));
const compiled = ts.transpileModule(read('components/HomeHeroPagination.tsx'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const mod = {exports:{}};
new Function('require','module','exports',compiled)(name => {
  if(name === 'react/jsx-runtime') return require(name);
  if(name === './HomeHeroPagination.module.css') return {default:classes};
  throw new Error('Unexpected import: ' + name);
},mod,mod.exports);
const Pagination = mod.exports.default;
const title = 'Провожающая в последний путь Фрирен';
const slides = Array.from({length:5},(_,i)=>({id:i+1,title:title+' · '+(i+1)}));
function contrast(a,b) {
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
(async()=>{
  const moduleCSS = await postcss([local(),scope({generateScopedName:n=>'hero_'+n})])
    .process(read('components/HomeHeroPagination.module.css'),{from:'components/HomeHeroPagination.module.css'});
  moduleCSS.root.walkRules(':export',r=>r.remove());
  const socialCSS = await postcss([local(),scope({generateScopedName:n=>'social_'+n})])
    .process(read('components/HomeHeroSocialLink.module.css'),{from:'components/HomeHeroSocialLink.module.css'});
  socialCSS.root.walkRules(':export',r=>r.remove());
  // Invoke the actual event closures, not a copied selection algorithm.
  const selections=[];
  for(const count of [0,1,2,5]) {
    const element=Pagination({slides:slides.slice(0,count),activeIndex:0,onSelect:i=>selections.push(i)});
    if(count<2){assert.equal(element,null);continue;}
    const buttons=element.props.children[1].props.children;
    assert.equal(buttons.length,count);
    buttons.forEach((button,index)=>{button.props.onClick();assert.equal(selections.at(-1),index);});
  }
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  let cases=0;
  try {
    const page=await browser.newPage();
    await page.route('**/*',r=>r.abort());
    await page.emulateMedia({reducedMotion:'reduce'});
    const screens=[[320,700],[360,800],[375,812],[390,844],[412,915],[430,932],
      [600,900],[768,1024],[844,390],[1024,520],[1440,900],[1920,1080]];
    for(const theme of ['dark','light'])for(const [width,height] of screens)for(const activeIndex of [0,2,4]) {
      await page.setViewportSize({width,height});
      const pagination=renderToStaticMarkup(React.createElement(Pagination,{slides,activeIndex,onSelect:()=>{}}));
      await page.setContent(`<!doctype html><html data-animebox-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCSS}\n${moduleCSS.css}\n${socialCSS.css}</style></head><body><div class="app-shell"><main class="page-content"><div class="home-page"><div class="home-grid home-grid--main"><div class="main-column"><section class="page-hero home-hero-carousel"><picture><img alt="" class="page-hero__backdrop home-hero-carousel__backdrop is-visible" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450'%3E%3C/svg%3E"></picture><div class="page-hero__overlay"></div><div class="page-hero__content home-hero-carousel__content"><h1 class="is-long-title">${title}</h1><div class="hero-actions"><a href="#" class="btn btn--primary">Смотреть</a><a href="#" class="btn btn--ghost">Подробнее</a></div><a href="#" data-social class="social_link">✦ Смотреть вместе с друзьями →</a></div>${pagination}</section></div></div></div></main></div></body></html>`);
      await page.locator('.hero_pagination').scrollIntoViewIfNeeded();
      const geometry=await page.evaluate(()=>{
        for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
        const r=el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
        const hero=document.querySelector('.home-hero-carousel'),nav=document.querySelector('.hero_pagination');
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
        const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
        const bg=rgb(getComputedStyle(hero).getPropertyValue('--ab-ui-surface').trim());
        const buttons=[...document.querySelectorAll('.hero_position')].map(el=>{
          const mark=el.querySelector('.hero_mark');const color=rgb(getComputedStyle(mark).backgroundColor);
          return {rect:r(el),mark:r(mark),color,bg,pressed:el.getAttribute('aria-pressed'),display:getComputedStyle(mark).display,
            hit:document.elementFromPoint(el.getBoundingClientRect().left+el.clientWidth/2,Math.min(innerHeight-1,el.getBoundingClientRect().top+22))===el};
        });
        const art=document.querySelector('.home-hero-carousel__backdrop');
        const title=document.querySelector('.home-hero-carousel__content h1');
        const titleCss=getComputedStyle(title);
        return {hero:r(hero),nav:r(nav),social:r(document.querySelector('[data-social]')),
          art:r(art),title:r(title),titleCss:{clamp:titleCss.webkitLineClamp,display:titleCss.display,overflow:titleCss.overflow},
          buttons,
          counter:document.querySelector('.hero_counter').textContent,scroll:document.documentElement.scrollWidth};
      });
      const tag=`${theme}/${width}x${height}/active-${activeIndex}`;
      assert.equal(geometry.buttons.length,5,tag+': missing positions');
      assert.equal(geometry.counter,`${String(activeIndex+1).padStart(2,'0')} / 05`,tag+': counter');
      assert.equal(geometry.buttons.filter(b=>b.pressed==='true').length,1,tag+': selected count');
      assert(geometry.scroll<=width+1,tag+': document overflow');
      if(width<=768){
        assert(Math.abs(geometry.art.width-geometry.hero.width)<=2 &&
          Math.abs(geometry.art.height-geometry.hero.height)<=2,
          tag+': mobile artwork must cover hero '+JSON.stringify(geometry));
        assert(geometry.titleCss.clamp==='2' && geometry.titleCss.overflow==='hidden',
          tag+': the CSS cascade disables two-line clamp '+JSON.stringify(geometry.titleCss));
        assert(geometry.title.top>=geometry.hero.top+96 && geometry.title.bottom<geometry.art.bottom,
          tag+': mobile headline must sit over lower scrim '+JSON.stringify({title:geometry.title,art:geometry.art}));
      }
      assert(geometry.nav.top>=geometry.social.bottom+8,tag+': social link overlaps pagination '+JSON.stringify(geometry));
      for(const [index,item] of geometry.buttons.entries()) {
        assert(item.rect.width>=44&&item.rect.height>=44,tag+': target below 44px '+JSON.stringify(item.rect));
        assert(item.rect.left>=geometry.hero.left&&item.rect.right<=geometry.hero.right,tag+': target outside hero');
        assert(item.rect.bottom<=geometry.hero.bottom&&item.rect.top>=geometry.hero.top,tag+': target outside hero vertically');
        assert(item.hit,tag+': target blocked at its center');
        assert(item.mark.width>0&&item.mark.height>=4&&item.display!=='none',tag+': invisible mark');
        assert(contrast(item.color,item.bg)>=3,tag+': mark contrast below 3:1');
        assert.equal(item.pressed,index===activeIndex?'true':'false',tag+': wrong selected position');
        if(index>0)assert(item.rect.left>=geometry.buttons[index-1].rect.right-1,tag+': overlapping touch targets');
      }
      const selected=geometry.buttons[activeIndex];
      assert.equal(Math.round(selected.mark.width),24,tag+': active position shape missing');
      const button=page.locator('.hero_position').nth(activeIndex);
      await button.focus();
      const focus=await button.evaluate(el=>({visible:el.matches(':focus-visible'),width:parseFloat(getComputedStyle(el).outlineWidth)}));
      assert(focus.visible&&focus.width>=2,tag+': keyboard focus missing');
      if(process.env.HERO_SCREENSHOT_DIR&&width===390&&activeIndex===0){
        fs.mkdirSync(process.env.HERO_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:process.env.HERO_SCREENSHOT_DIR+'/hero-'+theme+'.png',fullPage:true});
      }
      cases++;
    }
    console.log(`PASS ${cases} hero/theme/viewport/selection cases; actual pagination React component, 44px targets, 5 visible positions, contrast >=3, focus, counter and callback indices. Shell is source-equivalent; no hydrated carousel E2E claimed.`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
