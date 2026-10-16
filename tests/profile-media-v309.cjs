const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,imports={},tail='') {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('module','exports','require',code+tail)(module,module.exports,name=>{
  if(name in imports)return imports[name];
  if(name.startsWith('node:'))return require(name);
  throw Error('Unexpected import: '+name);
 });return module.exports;
}
const normalizer=load('lib/profile-media-normalize-client.ts');
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const community={ApiError,adminClient:()=>({storage:{from:()=>({createSignedUploadUrl:async()=>({data:{token:'test-token'}})})}}),userClient:async()=>({user:{id:'11111111-1111-4111-8111-111111111111'}}),readBody:r=>r.json(),response:d=>Response.json(d),failure:e=>Response.json({error:e.message},{status:e.status||500})};
let premium=false;
const api=load('app/api/profile/media/upload-url/route.ts',{
 '@/lib/community-server':community,
 '@/lib/entitlements-server':{getEffectiveUserEntitlements:async()=>({profileStudio:premium,premiumThemes:premium})},
 '@/lib/api-rate-limit':{enforceIpAndUserRateLimit:async()=>null},
});
const publisher=load('lib/profile-media-publish-server.ts',{'server-only':{},'@/lib/community-server':community,'@/lib/profile-media-inspect-server':{}},'\nexports.validate=validateTechnicalMedia;');
const transform=()=>({x:50,y:50,zoom:1});
const {resolveProfileAppearance:appearance}=load('lib/profile-appearance.ts',{'@/lib/premium-studio':{premiumMediaTransform:transform}});
const studio={avatarPath:'animated-avatar',avatarStaticPath:'static-avatar',bannerPath:'animated-banner',bannerStaticPath:'static-banner'};
assert.equal(appearance({baseBannerPath:'old-base',premiumStudio:studio,premiumActive:false}).bannerPath,null);
assert.equal(appearance({premiumStudio:studio,premiumActive:false}).avatarPath,'static-avatar');
assert.equal(appearance({premiumStudio:studio,premiumActive:true,premiumMediaActive:false}).bannerPath,'static-banner');
const group={scope:'base',kind:'avatar'};
function item(width=256,size=1000,animated=false){return {size,storageMime:'image/webp',candidate:{path:'x.webp',variant:'original'},inspection:{width,height:width,mimeType:'image/webp',extension:'webp',animated}};}
publisher.validate(group,item());
assert.throws(()=>publisher.validate(group,item(512)),/разрешение/);
publisher.validate(group,item(512),true);
assert.throws(()=>publisher.validate(group,item(256,201*1024)),/размер/);
assert.throws(()=>publisher.validate(group,item(256,1000,true)),/Анимация/);
assert.throws(()=>publisher.validate({scope:'premium',kind:'avatar'},item(1024)),/разрешение/);
publisher.validate({scope:'premium',kind:'avatar'},item(512,1000,true));
(async()=>{
 const gif=new File([Buffer.from('GIF89a')],'animated.gif',{type:'application/octet-stream'});
 assert(await normalizer.isAnimatedPickedImage(gif));
 const webp=Buffer.alloc(32);webp.write('RIFF',0);webp.write('WEBP',8);webp.write('VP8X',12);webp[20]=2;
 assert(await normalizer.isAnimatedPickedImage(new File([webp],'animated.webp')));
 webp[20]=0;assert.equal(await normalizer.isAnimatedPickedImage(new File([webp],'static.webp')),false);
 for(const [paid,scope,kind,size,status] of [[false,'base','avatar',1000,200],[false,'base','banner',1000,403],[true,'base','banner',1000,200],[false,'premium','avatar',1000,403],[true,'base','avatar',201*1024,413]]){
  premium=paid;
  const r=await api.POST(new Request('https://example.test/api/profile/media/upload-url',{method:'POST',body:JSON.stringify({scope,kind,variant:'original',mimeType:'image/webp',size})}));
  assert.equal(r.status,status,JSON.stringify({paid,scope,kind,size}));
  if(status===200){const payload=await r.json();assert(payload.quarantinePath.startsWith('11111111-1111-4111-8111-111111111111/pending/'));}
 }
 let uploadNever=false;
 const client={auth:{getUser:async()=>({data:{user:{id:'owned-user'}}})},storage:{from:()=>({uploadToSignedUrl:()=>uploadNever?new Promise(()=>{}):Promise.resolve({error:{statusCode:'413',name:'StorageApiError'}})})}};
 const upload=load('lib/profile-media-upload-client.ts',{'@/lib/supabase/client':{createClient:()=>client}});
 const oldFetch=global.fetch,oldWindow=global.window;
 global.window={setTimeout:fn=>setTimeout(fn,5),clearTimeout};
 try {
  global.fetch=async()=>Response.json({token:'test',quarantinePath:'owned/pending/file',publicPath:'owned/avatar.webp'});
  await assert.rejects(upload.uploadAvatar({scope:'base',variant:'original',body:new Blob(['test'],{type:'image/webp'})}),/Storage/);
  uploadNever=true;
  await assert.rejects(upload.uploadBanner({scope:'base',variant:'original',body:new Blob(['test'],{type:'image/webp'})}),/заняла слишком много времени/);
  global.fetch=(_input,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))));
  await assert.rejects(upload.profileMediaFetchWithTimeout('/test',{},5),/слишком долго/);
  await assert.rejects(upload.setBannerColor('red'),/#RRGGBB/);
 } finally {global.fetch=oldFetch;global.window=oldWindow;}
 console.log('PASS upload diagnostics: Storage 413, slow upload, aborted prepare request, invalid banner color.');
 console.log('PASS real upload route: owned signed paths, free avatar, Premium banner, expiry and size gates; real publisher geometry/animation limits and appearance expiry.');
})().catch(e=>{console.error(e);process.exitCode=1;});
