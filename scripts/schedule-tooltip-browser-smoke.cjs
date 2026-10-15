/** Real TooltipLink + React DOM, CSS Modules and root theme CSS in offline Chromium.
 * Native link adapter replaces Next navigation/prefetch; this is not schedule SSR E2E. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ts = require('typescript');
const postcss = require('postcss');
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const read = file => fs.readFile(file, 'utf8');
const wait = page => page.waitForFunction(() => window.__tooltipListeners() === 0);
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'animebox-tooltip-'));
  let browser;
  try {
    const component = ts.transpileModule(await read('components/ui/TooltipLink.tsx'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    await fs.writeFile(path.join(dir, 'TooltipLink.js'), component);
    await fs.writeFile(path.join(dir, 'styles.js'), 'module.exports={tooltip:"schedule_tooltip"};');
    await fs.writeFile(path.join(dir, 'link.js'), `const React=require('react');
      module.exports=React.forwardRef(function Link(props,ref){return React.createElement('a',{...props,ref});});`);
    await fs.writeFile(path.join(dir, 'entry.js'), `const React=require('react');
      const {createRoot}=require('react-dom/client');const Tip=require('./TooltipLink').default;
      const root=createRoot(document.getElementById('root'));
      window.__unmount=()=>root.unmount();
      root.render(React.createElement('section',null,Array.from({length:100},(_,i)=>
        React.createElement('div',{key:i,className:'clip',id:'clip-'+i},React.createElement(Tip,
          {href:'#title-'+i,className:'anchor',label:'Провожающая в последний путь Фрирен — '+
            'ДлинноеНазваниеБезПробелов'.repeat(3)+' — Эпизод '+(i+1)},'Тайтл '+i)))));`);
    const compiler = webpack({ mode: 'production', target: 'web', entry: path.join(dir, 'entry.js'),
      output: { path: dir, filename: 'bundle.js' },
      resolve: { modules: [path.resolve('node_modules')], alias: {
        'next/link$': path.join(dir, 'link.js'),
        './TooltipLink.module.css$': path.join(dir, 'styles.js'),
      } }, optimization: { minimize: false }, devtool: false,
    });
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(closeError => {
        if (error || closeError || stats.hasErrors()) reject(error || closeError || new Error(stats.toString({all:false,errors:true})));
        else resolve();
      });
    }));
    const bundle = await read(path.join(dir, 'bundle.js'));
    const css = await postcss([local(), scope({ generateScopedName: n => 'schedule_' + n })])
      .process(await read('components/ui/TooltipLink.module.css'), { from: 'components/ui/TooltipLink.module.css' });
    css.root.walkRules(':export', rule => rule.remove());
    const rootCSS = (await Promise.all([...((await read('app/layout.tsx')).matchAll(/import '\.\/([^']+\.css)'/g))]
      .map(m => read('app/' + m[1])))).map(s => s.replace(/@import[^;]+;/g, '')).join('\n');
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    const setup = async (theme, width, height) => {
      await page.evaluate(() => { window.__unmount?.(); window.__restoreTooltipListeners?.(); });
      await page.setViewportSize({ width, height });
      await page.setContent(`<!doctype html><html data-animebox-theme="${theme}"><head>
        <meta name="viewport" content="width=device-width,initial-scale=1"><style>${rootCSS}\n${css.css}
        html,body{margin:0;min-height:100%;} .clip{position:absolute;left:-1000px;top:0;width:140px;height:44px;overflow:hidden;}
        .anchor{display:block;width:140px;height:44px;background:var(--ab-ui-surface);color:var(--ab-ui-text);}
        </style></head><body><div id="root"></div></body></html>`);
      await page.evaluate(() => {
        const listeners = new Map(), add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
        window.addEventListener = (type, fn, options) => {
          if (['scroll','resize','keydown'].includes(type)) {
            if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);
          }
          return add(type, fn, options);
        };
        window.removeEventListener = (type, fn, options) => { listeners.get(type)?.delete(fn); return remove(type, fn, options); };
        window.__tooltipListeners = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
        window.__restoreTooltipListeners = () => { window.addEventListener=add; window.removeEventListener=remove; };
      });
      await page.addScriptTag({ content: bundle });
      await page.waitForFunction(() => document.querySelectorAll('.anchor').length === 100);
      assert.equal(await page.evaluate(() => window.__tooltipListeners()), 0, '100 idle links subscribed globally');
    };
    const move = (index, left, top) => page.evaluate(({ index,left,top }) => {
      Object.assign(document.getElementById('clip-' + index).style, { left:left+'px',top:top+'px' });
    }, { index,left,top });
    const tip = page.getByRole('tooltip');
    let cases = 0;
    for (const theme of ['dark','light']) for (const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]) {
      await setup(theme,width,height);
      for (const [left,top,below] of [[0,0,true],[width-140,0,true],[0,height-44,false],[width-140,height-44,false]]) {
        await move(0,left,top);
        await page.locator('.anchor').first().hover();
        await tip.waitFor({ state:'visible' });
        const metrics = await tip.evaluate(el => {
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
          const lum = c => rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
            .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
          // Theme token colors may use modern CSS syntax; canvas resolves both.
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d');
          const color=value=>{ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return 'rgb('+[...ctx.getImageData(0,0,1,1).data].slice(0,3).join(',')+')';};
          const a=lum(color(s.color)),b=lum(color(s.backgroundColor));
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,
            portal:el.parentElement===document.body,pointer:s.pointerEvents,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),
            overflow:document.documentElement.scrollWidth,described:document.querySelector('.anchor').getAttribute('aria-describedby')===el.id};
        });
        const tag=theme+'/'+width+'x'+height+'/'+left+','+top;
        assert(metrics.portal&&metrics.described,tag+': portal/description');
        assert(metrics.left>=11.5&&metrics.right<=width-11.5,tag+': horizontal clipping');
        assert(metrics.top>=11.5&&metrics.bottom<=height-11.5,tag+': vertical clipping');
        assert(below?metrics.top>=top+44:metrics.bottom<=top,tag+': wrong flip');
        assert(metrics.overflow<=width,tag+': document overflow');
        assert(metrics.contrast>=4.5,tag+': contrast '+metrics.contrast);
        assert.equal(metrics.pointer,'none');
        assert.equal(await page.evaluate(() => window.__tooltipListeners()),3);
        if(process.env.TOOLTIP_SCREENSHOT_DIR&&width===390&&left===0&&top===0) {
          await fs.mkdir(process.env.TOOLTIP_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.TOOLTIP_SCREENSHOT_DIR,'tooltip-'+theme+'.png')});
        }
        // Put a real adjacent link under the painted tooltip: hit testing must reach it.
        await move(1,Math.max(0,Math.min(width-140,metrics.left)),metrics.top);
        const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('a')?.getAttribute('href'),{x:Math.max(1,metrics.left+20),y:metrics.top+20});
        assert.equal(hit,'#title-1',tag+': tooltip blocks neighbor');
        await page.keyboard.press('Escape');await tip.waitFor({state:'detached'});await wait(page);
        await move(1,-1000,0);
        await page.mouse.move(width/2,height/2);
        cases++;
      }
      await page.evaluate(() => window.__unmount());await wait(page);
    }
    await setup('dark',390,844);await move(0,20,100);await move(1,200,100);
    const first=page.locator('.anchor').nth(0),second=page.locator('.anchor').nth(1);
    await first.hover();await tip.waitFor({state:'visible'});
    // Deterministic browser events put return inside 150ms without slow CI mouse travel.
    await first.dispatchEvent('pointerleave',{pointerType:'mouse'});
    await first.dispatchEvent('pointerenter',{pointerType:'mouse'});
    await page.waitForTimeout(200);
    assert.equal(await tip.count(),1,'reentry lost visible panel');
    await second.hover();await tip.waitFor({state:'visible'});
    assert.match(await tip.textContent(),/Эпизод 2$/);
    assert.equal(await page.evaluate(() => window.__tooltipListeners()),3);
    await page.keyboard.press('Escape');await wait(page);
    await page.mouse.move(0,500);
    // Touch events are deliberately dispatched without native focus/navigation.
    await first.dispatchEvent('pointerenter',{pointerType:'touch'});
    await first.dispatchEvent('pointerleave',{pointerType:'touch'});
    await page.waitForTimeout(400);assert.equal(await tip.count(),0);await wait(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');await tip.waitFor({state:'visible'});
    assert.equal(await first.evaluate(el=>document.activeElement===el),true,'Tab target');
    await first.dispatchEvent('pointerleave',{pointerType:'mouse'});
    await page.waitForTimeout(200);assert.equal(await tip.count(),1,'keyboard tooltip lost on pointerleave');
    await page.keyboard.press('Escape');await wait(page);
    assert.equal(await first.evaluate(el=>document.activeElement===el),true,'Escape moved focus');
    assert.equal(await first.getAttribute('aria-describedby'),null);
    await page.keyboard.press('Tab');await tip.waitFor({state:'visible'});
    await page.evaluate(() => document.activeElement.blur());await wait(page);
    for (const type of ['scroll','resize','keydown']) for (const pending of [true,false]) {
      await page.mouse.move(0,500);await first.hover();
      if (!pending) await tip.waitFor({state:'visible'});
      await page.evaluate(type => {
        if(type==='keydown')window.dispatchEvent(new KeyboardEvent(type,{key:'Escape'}));
        else if(type==='scroll')document.getElementById('clip-0').dispatchEvent(new Event('scroll'));
        else window.dispatchEvent(new Event(type));
      },type);
      await wait(page);await page.waitForTimeout(400);
      assert.equal(await tip.count(),0,type+': stale '+(pending?'pending':'open')+' tooltip');
    }
    for (const state of ['pending','open','leaving']) {
      await setup('dark',390,844);await move(0,20,100);await page.locator('.anchor').first().hover();
      if(state!=='pending')await tip.waitFor({state:'visible'});
      if(state==='leaving')await page.locator('.anchor').first().dispatchEvent('pointerleave',{pointerType:'mouse'});
      await page.evaluate(()=>window.__unmount());await wait(page);await page.waitForTimeout(400);
      assert.equal(await tip.count(),0,'unmount '+state);
    }
    assert.deepEqual(errors,[],'uncaught browser errors');
    console.log(`PASS ${cases} theme/viewport/edge geometry cases; 100 idle links=0 listeners, active=3; reentry, neighbor hit testing, keyboard, touch, scroll/resize/Escape and unmount. Real TooltipLink/React DOM; native Link adapter, no schedule SSR/router E2E claimed.`);
  } finally {
    if(browser)await browser.close();
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
