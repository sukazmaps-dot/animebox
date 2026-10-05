const assert=require('node:assert/strict');
const {build}=require('esbuild');
const React=require('react');
const {renderToPipeableStream}=require('react-dom/server');
const {PassThrough}=require('node:stream');
(async()=>{
 let resolveHistory;
 global.chatStreamHistory=new Promise(resolve=>resolveHistory=resolve);
 const result=await build({entryPoints:['app/chat/page.tsx'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:
 a.path==='@/lib/chat-server'?`export const getChatMessagesPage=()=>global.chatStreamHistory`:
 a.path==='@/components/chat/ChatLoadingShell'?`import React from 'react';export default ()=>React.createElement('h1',null,'Загружаем последние сообщения…')`:
 a.path==='@/components/chat/GlobalChatV11Client'?`import React from 'react';export default ({initialPage})=>React.createElement('p',null,initialPage.messages[0]?.body||'empty')`:
 (()=>{throw new Error(a.path)})()}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);
 const out=new PassThrough();let html='';out.on('data',chunk=>html+=chunk.toString());
 const done=new Promise((resolve,reject)=>{out.on('end',resolve);out.on('error',reject)});
 let resolveShell;const shellReady=new Promise(resolve=>resolveShell=resolve);
 let stream;stream=renderToPipeableStream(React.createElement('html',null,React.createElement('body',null,React.createElement(mod.exports.default))),{onShellReady(){stream.pipe(out);resolveShell()},onError(error){throw error}});
 await shellReady;await new Promise(resolve=>setImmediate(resolve));
 assert.match(html,/Загружаем последние сообщения/,'shell streams before history resolves');
 assert.doesNotMatch(html,/STREAM_MESSAGE/);
 resolveHistory({messages:[{body:'STREAM_MESSAGE'}],nextCursor:null});await done;
 assert.match(html,/STREAM_MESSAGE/,'history follows in the same response');
 delete global.chatStreamHistory;
 console.log('PASS: actual chat route streams loading shell before delayed history and delivers messages afterward');
})().catch(error=>{console.error(error);process.exitCode=1});
