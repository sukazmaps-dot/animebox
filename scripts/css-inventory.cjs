#!/usr/bin/env node
'use strict';

// Source-level CSS inventory: reports review candidates, never edits application CSS.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const ts = require('typescript');

const args = process.argv.slice(2);
const rootArg = args.find((value) => value.startsWith('--root='));
const root = path.resolve(rootArg ? rootArg.slice(7) : process.cwd());
const check = args.includes('--check');
const saveReport = args.includes('--report');
const ignored = new Set(['.git', '.next', 'node_modules', 'out', 'coverage', 'build', 'dist',
  '.vercel', '.turbo', 'artifacts', '.cache']);
const sourceExt = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const files = [];
const errors = [];

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) scan(absolute);
    if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
}
scan(root);
files.sort();
const cssFiles = files.filter((file) => file.endsWith('.css'));
const cssSet = new Set(cssFiles);
const owners = new Map(cssFiles.map((file) => [file, new Set()]));
const missing = [];
const records = [];
const selectors = new Map();
const variables = new Map();

function localPath(importer, specifier) {
  const clean = specifier.split('?')[0];
  if (clean.startsWith('@/')) return clean.slice(2);
  if (clean.startsWith('./') || clean.startsWith('../'))
    return path.relative(root, path.resolve(root, path.dirname(importer), clean))
      .split(path.sep).join('/');
  return null;
}
function track(importer, specifier) {
  const target = localPath(importer, specifier);
  if (!target) return;
  if (!cssSet.has(target)) missing.push({ importer, target });
  else owners.get(target).add(importer);
}

for (const file of files) {
  if (!sourceExt.has(path.extname(file)) || file.startsWith('tests/') ||
      file.startsWith('scripts/')) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const kind = /[.]([jt])sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  function walk(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
        /[.]css(?:[?].*)?$/.test(node.moduleSpecifier.text))
      track(file, node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
         node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
        /[.]css(?:[?].*)?$/.test(node.arguments[0].text))
      track(file, node.arguments[0].text);
    ts.forEachChild(node, walk);
  }
  walk(ast);
}

for (const file of cssFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  let ast;
  try { ast = postcss.parse(content, { from: file }); }
  catch (error) {
    errors.push(file + ': ' + (error.reason || error.message));
    continue;
  }
  const row = {
    path: file, kind: file.endsWith('.module.css') ? 'module' : 'global',
    bytes: Buffer.byteLength(content), rules: 0, declarations: 0,
    important: 0, uniqueSelectors: 0, importers: [],
  };
  const localSelectors = new Set();
  ast.walkRules((rule) => {
    row.rules += 1;
    const context = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent)
      if (parent.type === 'atrule') context.push('@' + parent.name + ' ' + parent.params);
    for (const raw of rule.selectors || [rule.selector]) {
      const selector = raw.trim().replace(/\s+/g, ' ');
      if (!selector) continue;
      localSelectors.add(selector);
      if (!selectors.has(selector)) selectors.set(selector, []);
      selectors.get(selector).push({
        file, line: rule.source && rule.source.start ? rule.source.start.line : 0,
        context: context.reverse().join(' > ') || 'base',
      });
    }
  });
  ast.walkDecls((decl) => {
    row.declarations += 1;
    if (decl.important) row.important += 1;
    if (decl.prop.startsWith('--')) {
      if (!variables.has(decl.prop)) variables.set(decl.prop, []);
      variables.get(decl.prop).push({
        file, line: decl.source && decl.source.start ? decl.source.start.line : 0,
        selector: decl.parent && decl.parent.selector || ':root',
      });
    }
  });
  ast.walkAtRules('import', (rule) => {
    const found = /^\s*['"]([^'"]+[.]css)['"]/.exec(rule.params);
    if (found) track(file, found[1]);
  });
  row.uniqueSelectors = localSelectors.size;
  records.push(row);
}
for (const row of records) row.importers = [...(owners.get(row.path) || [])].sort();

const overlaps = [];
for (const [selector, sites] of selectors) {
  const affected = [...new Set(sites.map((site) => site.file))].sort();
  if (affected.length > 1)
    overlaps.push({
      selector, fileCount: affected.length, occurrences: sites.length,
      contexts: [...new Set(sites.map((site) => site.context))].sort(),
      files: affected,
    });
}
overlaps.sort((a, b) => b.fileCount - a.fileCount ||
  b.occurrences - a.occurrences || a.selector.localeCompare(b.selector));
const cssVariables = [...variables].map(([name, sites]) => ({
  name, definitions: sites.length, files: [...new Set(sites.map((site) => site.file))].sort(),
})).sort((a, b) => b.definitions - a.definitions || a.name.localeCompare(b.name));
const rootLayout = path.join(root, 'app/layout.tsx');
const rootImports = fs.existsSync(rootLayout)
  ? [...fs.readFileSync(rootLayout, 'utf8').matchAll(/import\s+['"]\.\/([^'"]+[.]css)['"]/g)]
      .map((match) => 'app/' + match[1])
  : [];
const withoutStaticImport = records.filter((row) => !row.importers.length)
  .map((row) => row.path);
const counts = {
  cssFiles: records.length,
  cssModules: records.filter((row) => row.kind === 'module').length,
  globalCss: records.filter((row) => row.kind === 'global').length,
  rootCssImports: rootImports.length,
  declarations: records.reduce((sum, row) => sum + row.declarations, 0),
  important: records.reduce((sum, row) => sum + row.important, 0),
  selectorOverlapCandidates: overlaps.length,
  withoutStaticImport: withoutStaticImport.length,
  missingLocalImports: missing.length,
};
const report = {
  schemaVersion: 1, sourceSha: process.env.GITHUB_SHA || null,
  note: 'Static source audit, not computed CSS or dead-code analysis',
  counts, rootImports, files: records, overlaps, cssVariables,
  withoutStaticImport, missingLocalImports: missing,
  parseErrors: errors,
};
if (saveReport) {
  const output = path.join(root, 'artifacts', 'css-inventory');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'inventory.json'),
    JSON.stringify(report, null, 2) + '\n');
  const code = String.fromCharCode(96);
  const cell = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# AnimeBox CSS inventory', '',
    '> Generated review candidates. Repeated selectors do not necessarily mean broken CSS.', '',
    '| Metric | Count |', '| --- | ---: |',
    ...Object.entries(counts).map(([key, value]) => '| ' + key + ' | ' + value + ' |'),
    '', '## Cross-file selector overlaps', '',
    '| Selector | Files | Occurrences | Source files |',
    '| --- | ---: | ---: | --- |',
    ...overlaps.slice(0, 35).map((item) => '| ' + code + cell(item.selector) + code +
      ' | ' + item.fileCount + ' | ' + item.occurrences + ' | ' +
      cell(item.files.slice(0, 5).join(', ')) + ' |'),
    '', '## Highest !important counts', '',
    '| File | Important | Rules | Bytes | Importers |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...[...records].sort((a, b) => b.important - a.important || b.bytes - a.bytes)
      .slice(0, 35).map((item) => '| ' + code + cell(item.path) + code + ' | ' +
        item.important + ' | ' + item.rules + ' | ' + item.bytes +
        ' | ' + item.importers.length + ' |'),
    '', '## No static import detected: investigate before deleting', '',
    ...withoutStaticImport.slice(0, 80).map((file) => '- ' + code + file + code),
    '', '## Unresolved local imports', '',
    ...(missing.length ? missing.map((item) => '- ' + item.importer + ' → ' + item.target)
      : ['None']),
    '', '## Limitations', '',
    '- Selector overlaps can be intentional theme, media, or cascade overrides.',
    '- No static import does not prove unused CSS: dynamic/runtime or external references may exist.',
    '- The report does not evaluate selector specificity, nesting or browser computed styles.',
    '- Do not modify or delete styles until owners and visual regressions are checked.',
    '',
  ];
  fs.writeFileSync(path.join(output, 'summary.md'), lines.join('\n'));
}
console.log('[CSS inventory] ' + counts.cssFiles + ' CSS files, ' + counts.cssModules +
  ' modules, ' + counts.rootCssImports + ' root imports, ' +
  counts.important + ' !important, ' + overlaps.length + ' selector overlap candidates.');
for (const item of missing.slice(0, 30))
  console.warn('[CSS inventory] Missing import: ' + item.importer + ' → ' + item.target);
for (const error of errors) console.error('[CSS inventory] Invalid CSS: ' + error);
if (check && (missing.length || errors.length || rootImports.length > 76)) {
  if (rootImports.length > 76) console.error('[CSS inventory] Root import budget exceeded');
  process.exitCode = 1;
}
