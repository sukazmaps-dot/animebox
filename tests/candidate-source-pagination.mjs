import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
const source=readFileSync('app/api/recommendations/route.ts','utf8');
const functions=source.slice(source.indexOf('function selectCandidateSource('),source.indexOf('function fallbackSource('));
const {code}=await transform(functions+'\nexport {candidateSourcePage,selectCandidateSource};',{loader:'ts',format:'esm'});
const {candidateSourcePage,selectCandidateSource}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const bucket of [0,1,2,3])for(const mood of ['any','comfort'])for(const intent of ['default','mood'])for(const hasTasteGenre of [false,true]){
 const counts=new Map();
 for(let page=1;page<=50;page++){
  const context={page,bucket,mood,intent,hasTasteGenre};
  const source=selectCandidateSource(context);
  const ordinal=(counts.get(source)??0)+1;counts.set(source,ordinal);
  assert.equal(candidateSourcePage({...context,source}),ordinal,JSON.stringify(context));
 }
}
assert.equal(candidateSourcePage({page:5,bucket:0,mood:'any',intent:'default',hasTasteGenre:false,source:'seasonal'}),1);
assert.equal(candidateSourcePage({page:12,bucket:0,mood:'any',intent:'default',hasTasteGenre:false,source:'seasonal'}),2);
console.log('PASS: each source starts at page 1 and advances without gaps across bucket/mood/intent/genre combinations');
