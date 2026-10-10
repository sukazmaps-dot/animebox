import { createRequire } from 'node:module';
const load = createRequire(import.meta.url);
const assert = load('node:assert/strict');
const fs = load('node:fs');
const Module = load('node:module');
const ts = load('typescript');
const React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');

function loadProvider() {
  const filename = load('node:path').resolve('components/home/HomeScheduleRuntimeProvider.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(process.cwd());
  const normalRequire = mod.require.bind(mod);
  mod.require = (name) => {
    if (name.includes('HomeFeedRuntimeProvider')) return {
      useHomeFeedRuntime: () => ({ personalizedHome: false, personalAnimeIds: new Set(), retentionCompletionCandidates: [] }),
    };
    if (name.includes('useHomeScheduleData')) return {
      useHomeScheduleData: () => ({ scheduleItems: [], scheduleWindowItems: [], scheduleLoading: true, scheduleError: '', upcomingScheduleLoading: true }),
    };
    if (name.includes('home-retention-policy')) return { selectPersonalHomeSchedule: () => [] };
    return normalRequire(name);
  };
  mod._compile(code, filename);
  return mod.exports;
}
const OriginalDate = Date;
const oldTZ = process.env.TZ;
const markup = [];
try {
  for (const timezone of ['UTC', 'Asia/Qyzylorda', 'America/Los_Angeles']) {
    process.env.TZ = timezone;
    for (const instant of ['2026-10-10T21:30:00Z', '2026-10-11T00:01:00Z']) {
      global.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [instant])); }
        static now() { return new OriginalDate(instant).getTime(); }
      };
      const provider = loadProvider();
      function Probe() {
        const state = provider.useHomeScheduleRuntime();
        assert.deepEqual(state.scheduleDays, []);
        assert.equal(state.selectedScheduleDay, '');
        assert.equal(state.clockNow, 0);
        return React.createElement('output', null, JSON.stringify({ days: state.scheduleDays, selected: state.selectedScheduleDay, now: state.clockNow }));
      }
      markup.push(renderToStaticMarkup(React.createElement(provider.default, null, React.createElement(Probe))));
    }
  }
  assert.equal(new Set(markup).size, 1);
  console.log('PASS: actual home schedule provider SSR is identical across three timezones and midnight boundaries.');
} finally {
  global.Date = OriginalDate;
  if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ;
}
