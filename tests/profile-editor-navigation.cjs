const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function transpile(file,resolve){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(resolve,mod,mod.exports);return mod.exports;}
const navigation=transpile('lib/profile-editor-navigation.ts',require);
const page=transpile('app/profile/edit/page.tsx',id=>id==='@/lib/profile-editor-navigation'?navigation:id==='@/components/profile/ProfileEditorClient'?{__esModule:true,default:()=>null}:require(id));
(async()=>{
 for(const tab of ['avatar','banner','frame']){
  const result=await page.default({searchParams:Promise.resolve({tab})});
  assert.equal(result.props.initialTab,'profile');assert.equal(result.props.initialAnchor,tab);
 }
 for(const [tab,expected] of [['profile','profile'],['style','style'],['premium','style'],['showcase','showcase'],['widgets','showcase'],['rewards','rewards'],['awards','rewards'],['unknown','profile']]){
  const result=await page.default({searchParams:Promise.resolve({tab})});assert.equal(result.props.initialTab,expected);assert.equal(result.props.initialAnchor,'name');
 }
 console.log('PASS profile editor route aliases: old media tabs become anchors, other destinations remain compatible.');
})().catch(e=>{console.error(e);process.exit(1)});
