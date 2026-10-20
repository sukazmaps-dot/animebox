/* Actual dashboard presentation and state transitions; no payment API mutation. */
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = { addEventListener() {}, removeEventListener() {} };
let cached, pages, invalidations = 0;
const requests = [];
const empty = { totalStars: 0, telegramLinked: true, payments: [], donations: [], hasMore: false, sponsor: null };
const payment = { id: 'stars-1', amount: 25, created_at: '2026-10-20T00:00:00Z', status: 'refunded', refund_reason: 'Возврат' };
const donation = { id: 'donation-1', provider: 'donatepay', amount: '1250.50', currency: 'KZT', status: 'paid', created_at: '2026-10-20T00:00:00Z' };
const mocks = {
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/AuthStateProvider': { useAuthState: () => ({ user: { id: 'fixture-user' } }) },
  '@/lib/sponsor': { SPONSOR_META: { supporter: { label: 'Спонсор' }, premium: { label: 'Premium' }, patron: { label: 'Patron' } } },
  '@/lib/sponsor-me-client': { peekSponsorMe: () => cached, invalidateSponsorMe: () => { invalidations++; },
    getSponsorMe: async (_, page) => { requests.push(page); return pages[page] ?? empty; } },
  './SponsorBadge': { default: () => null },
  './AnimeBoxStar': { default: () => React.createElement('span', null, '★') },
  './SponsorProgressBar': { default: () => React.createElement('div', { role: 'progressbar' }) },
};
for (const value of Object.values(mocks)) value.__esModule = true;
const filename = path.resolve('components/monetization/SponsorDashboard.tsx');
const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(process.cwd());
const req = mod.require.bind(mod);
mod.require = name => name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : mocks[name] ?? req(name);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText, filename);
const { default: Dashboard, SponsorDashboardView: View } = mod.exports;
const html = props => renderToStaticMarkup(React.createElement(View, { history: true, data: empty, ...props }));
let output = html();
assert(output.includes('История пока пустая') && output.includes('href="/support"'));
assert(!output.includes('role="progressbar"') && !output.includes('Страница 1'), 'zero history has no empty progress/pager');
assert(!output.includes('sponsor-v2-panel'), 'history does not inherit legacy layout rules');
assert(!output.includes('btn--ghost'), 'history controls do not inherit old global button height overrides');
assert(output.includes('<details') && !output.includes('<details open'), 'accounting rules are disclosed on demand');
output = html({ data: { ...empty, payments: [payment], donations: [donation], totalStars: 25 } });
assert(output.includes('−25') && output.includes('Возврат') && output.includes('KZT') && output.includes('DonatePay'), 'refunds and separate currencies retained');
assert(output.includes('role="progressbar"') && !output.includes('Страница 1'), 'populated single page does not gain fake pagination');
assert(html({ page: 2 }).includes('← Назад'), 'empty late page keeps its way back');
assert(html({ history: false }).includes('sponsor-v2-panel'), 'non-history dashboard keeps its layout');

(async () => {
  cached = { ...empty, hasMore: true, payments: [payment], totalStars: 25 };
  pages = { 1: cached, 2: empty };
  let tree;
  await act(async () => { tree = create(React.createElement(Dashboard, { history: true })); });
  const button = text => tree.root.findAllByType('button').find(node => node.props.children === text);
  await act(async () => button('Дальше →').props.onClick());
  assert(requests.includes(2), 'next action reaches page two through existing client');
  assert(tree.root.findByProps({ 'data-support-empty': 'true' }));
  assert.equal(button('← Назад').props.disabled, false);
  await act(async () => button('← Назад').props.onClick());
  assert.equal(tree.root.findAllByProps({ 'data-support-empty': 'true' }).length, 0);
  await act(async () => button('Обновить').props.onClick());
  assert.equal(invalidations, 1, 'refresh keeps existing cache invalidation');
  await act(async () => tree.unmount());
  console.log('PASS support history: compact zero state, real currencies/refunds, late-empty navigation and refresh.');
})().catch(error => { console.error(error); process.exitCode = 1; });
