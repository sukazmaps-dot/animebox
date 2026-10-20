process.env.NODE_ENV='test';
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,imports){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(id=>imports[id]?{__esModule:true,...imports[id]}:require(id),mod,mod.exports);return mod.exports.default;}
const Floating=props=>React.createElement('panel',props,props.children);
const Picker=load('components/ui/ChoiceSelect.tsx',{'./FloatingMenu':{default:Floating},'./ChoiceSelect.module.css':{default:{}}});
(async()=>{let tree,chosen=[];await act(async()=>{tree=create(React.createElement(Picker,{label:'Озвучка',value:'a',options:[{id:'a',label:'Studio Band'},{id:'b',label:'AniDUB'}],onChange:v=>chosen.push(v)}));});
const trigger=()=>tree.root.findAllByType('button').find(n=>n.props['aria-haspopup']==='listbox');
assert.equal(trigger().props['aria-expanded'],false);
await act(async()=>trigger().props.onKeyDown({key:'ArrowDown',preventDefault(){}}));
assert.equal(trigger().props['aria-expanded'],true);
const options=tree.root.findAllByProps({role:'option'});assert.equal(options.length,2);assert.equal(options[0].props['aria-selected'],true);
await act(async()=>options[1].props.onClick());assert.deepEqual(chosen,['b']);assert.equal(trigger().props['aria-expanded'],false);
await act(async()=>trigger().props.onClick());await act(async()=>tree.root.findByType('panel').props.onClose());assert.equal(trigger().props['aria-expanded'],false);
assert.equal(tree.root.findAllByType('select').length,0);await act(async()=>tree.unmount());
const previousFetch=global.fetch;let requests=0;
global.fetch=async()=>{requests++;return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,animeFinished:true})};};
const Notification=load('components/AnimeNotificationControl.tsx',{
 './AnimeQuickActions.module.css':{default:{}},
 '@phosphor-icons/react':{},'framer-motion':{useReducedMotion:()=>true,motion:{span:'span'}},
 'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push(){}})},
 '@/components/ui/AnimeBoxIconCore':{default:'span'},'@/lib/telegram-links':{telegramMiniAppUrl:()=>''},
});
try {
 await act(async()=>{tree=create(React.createElement(Notification,{animeId:1,animeSlug:'fixture',animeTitle:'Fixture',episodesAired:12,isFinished:true,variant:'inline'}));});
 assert.equal(tree.toJSON(),null,'completed titles have no notification control');assert.equal(requests,0,'known completion must not fetch subscriptions');
 await act(async()=>tree.unmount());
} finally {global.fetch=previousFetch;}
const source=fs.readFileSync('components/ui/FloatingMenu.tsx','utf8');assert(source.includes('createPortal(')&&source.includes('node.showModal()'),'top-layer portal required for stacking and focus');
console.log('PASS E2 mounted picker: keyboard open, selected state, callback, close, no native select');
})().catch(e=>{console.error(e);process.exitCode=1});
