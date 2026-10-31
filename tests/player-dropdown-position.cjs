const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=fs.readFileSync('lib/player-dropdown-position.ts','utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
});
assert.equal(compiled.diagnostics?.length??0,0,'position helper must transpile');
const moduleRef={exports:{}};
new Function('exports','module',compiled.outputText)(moduleRef.exports,moduleRef);
const {calculatePlayerDropdownPosition}=moduleRef.exports;

const short=calculatePlayerDropdownPosition({
  trigger:{top:450,bottom:498,left:1670,right:1880,width:210},
  menuHeight:374,viewportWidth:1920,viewportHeight:608,align:'right',
});
assert.equal(short.placement,'top','short theater viewport opens upward');
assert(short.top>=8&&short.top+short.maxHeight<=440,'upward menu stays above trigger and inside viewport');
assert(short.left>=8&&short.left+short.width<=1912,'right alignment remains inside viewport');

const tall=calculatePlayerDropdownPosition({
  trigger:{top:280,bottom:328,left:640,right:850,width:210},
  menuHeight:374,viewportWidth:1365,viewportHeight:900,
});
assert.equal(tall.placement,'bottom','enough lower space opens downward');
assert.equal(tall.top,338,'downward menu is anchored below trigger');
assert(tall.top+tall.maxHeight<=892,'downward menu respects bottom gutter');

const narrow=calculatePlayerDropdownPosition({
  trigger:{top:100,bottom:148,left:4,right:64,width:60},
  menuHeight:220,viewportWidth:320,viewportHeight:640,
});
assert.equal(narrow.width,240,'short trigger keeps a usable popup width');
assert(narrow.left>=0&&narrow.left+narrow.width<=320,'narrow viewport clamps horizontal placement');

const cramped=calculatePlayerDropdownPosition({
  trigger:{top:190,bottom:230,left:100,right:300,width:200},
  menuHeight:320,viewportWidth:400,viewportHeight:260,
});
assert.equal(cramped.placement,'top','when neither side fits, choose the larger side');
assert(cramped.top>=0&&cramped.top+cramped.maxHeight<=260,'cramped viewport remains contained');
console.log('PASS player dropdown geometry: upward/downward placement, viewport clamping and cramped heights.');
