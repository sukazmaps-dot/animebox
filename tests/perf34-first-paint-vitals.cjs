'use strict';

// Production Web Vitals should be a bounded, sampled side channel.
// Instrument the actual client reporter with stubbed host APIs and verify
// that it cannot send URLs containing titles, profile IDs or query strings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const read = path => fs.readFileSync(path, 'utf8');
function compile(path, imports = {}) {
  const js = ts.transpileModule(read(path), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const target = { exports: {} };
  new Function('module', 'exports', 'require', js)(
    target, target.exports, id => {
      if (!(id in imports)) throw Error('Unexpected dependency: ' + id);
      return imports[id];
    },
  );
  return target.exports;
}

const rules = compile('lib/field-vitals.ts');
assert.equal(rules.performanceRouteGroup('/'), '/');
assert.equal(rules.performanceRouteGroup('/search'), '/search');
assert.equal(rules.performanceRouteGroup('/anime/frieren/watch'), '/anime/[slug]/watch');
assert.equal(rules.performanceRouteGroup('/anime/frieren'), '/anime/[slug]');
assert.equal(rules.performanceRouteGroup('/profile/private-user'), '/profile/[id]');
assert.equal(rules.performanceRouteGroup('/admin/overview'), null);
assert.equal(rules.performanceRouteGroup('/api/auth'), null);
assert.equal(rules.safeFieldVital({name:'LCP',value:1923.7,rating:'good'}).value, 1924);
assert.deepEqual(rules.safeFieldVital({name:'CLS',value:0.0788,rating:'poor'}), {
  metric:'CLS', value:79, unit:'milli', rating:'poor', navigation_type:'other',
});
assert.equal(rules.safeFieldVital({name:'LCP',value:Infinity}), null);
assert.equal(rules.safeFieldVital({name:'CLS',value:-1}), null);
assert.equal(rules.safeFieldVital({name:'private_metric',value:5}), null);

const layout = read('app/layout.tsx');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const pick = read('components/home/HomeTonightPick.tsx');
const names = read('lib/product-event-names.ts');
assert(layout.includes('<FieldWebVitals />'), 'vitals are mounted once at app layout');
assert(names.includes("'field_web_vital'"), 'first-party event is allowlisted');
assert(discovery.includes("import HomeTonightPick from '@/components/home/HomeTonightPick'"),
  'first hero is statically SSR-rendered, never client-only dynamic');
assert(!discovery.includes("ssr: false, loading: () => <HomeTonightLoading"),
  'first hero cannot wait for a lazy component chunk');
assert(discovery.includes('publicPreview') && discovery.includes('showingPublicPreview'),
  'verified SSR first-screen preview is missing');
assert(pick.includes("!preview && !busy && current"),
  'public unranked preview must not emit recommendation impressions');

let onWebVital;
const reported = [];
const reporter = compile('components/analytics/FieldWebVitals.tsx', {
  'next/web-vitals': { useReportWebVitals: callback => { onWebVital = callback; } },
  '@/lib/field-vitals': rules,
  '@/lib/product-events-client': { trackProductClientEvent: (...args) => reported.push(args) },
});
const originalEnv = process.env.NODE_ENV;
const originalRandom = Math.random;
const originalWindow = global.window;
process.env.NODE_ENV = 'production';
Math.random = () => 0; // deterministically admit the 2% diagnostic sample
global.window = {
  location: {pathname:'/anime/secret-title/watch',search:'?token=hidden'},
  innerWidth: 390,
  matchMedia: () => ({matches:false}),
};
try {
  reporter.default();
  assert.equal(typeof onWebVital, 'function');
  onWebVital({id:'lcp-1',name:'LCP',value:1842.2,rating:'good',navigationType:'navigate'});
  assert.equal(reported.length,1);
  assert.equal(reported[0][0],'field_web_vital');
  assert.equal(reported[0][1].path,'/anime/[slug]/watch');
  assert.equal(reported[0][1].source,'field_performance');
  assert.equal(reported[0][1].metadata.value,1842);
  assert.equal(reported[0][1].metadata.viewport,'mobile');
  assert(!JSON.stringify(reported[0]).includes('secret-title'));
  assert(!JSON.stringify(reported[0]).includes('token=hidden'));
  onWebVital({id:'lcp-1',name:'LCP',value:1920});
  assert.equal(reported.length,1,'duplicate vitals must not flood analytics');
  global.window.location.pathname='/admin';
  onWebVital({id:'lcp-2',name:'LCP',value:2300});
  assert.equal(reported.length,1,'admin pages never report');
  global.window.location.pathname='/';
  onWebVital({id:'cls-1',name:'CLS',value:0.11,rating:'needs-improvement'});
  assert.equal(reported.length,2);
  assert.equal(reported[1][1].metadata.unit,'milli');
  assert.equal(reported[1][1].metadata.value,110);
} finally {
  Math.random = originalRandom;
  process.env.NODE_ENV = originalEnv;
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
}

console.log('PASS Patch 34.0/34.1: sanitized sampled Core Web Vitals, safe route groups, SSR hero preview and no unranked attribution.');
