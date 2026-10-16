import type { BannerStyle } from './profile-banner-style';
import type { PremiumStudioSettings } from './premium-studio';

export type ProfileEditorDraft = {
  username: string; bio: string; bannerColor: string; bannerColorMode: 'auto' | 'manual';
  bannerStyle: BannerStyle; frame: string | null; premium: PremiumStudioSettings | null;
  avatar: File | null; banner: File | null; removeAvatar: boolean; removeBanner: boolean;
};
const fileIds=new WeakMap<File,number>();
let nextFileId=0;
export function draftKey(draft: ProfileEditorDraft) {
  const fileKey = (file: File | null) => {
    if(!file)return null;
    if(!fileIds.has(file))fileIds.set(file,++nextFileId);
    return [file.name,file.size,file.lastModified,fileIds.get(file)];
  };
  return JSON.stringify({...draft,avatar:fileKey(draft.avatar),banner:fileKey(draft.banner)});
}
export class ProfileDraftHistory {
  private values: ProfileEditorDraft[];
  private index = 0;
  constructor(initial: ProfileEditorDraft) {this.values=[initial];}
  get canUndo() {return this.index>0;}
  get canRedo() {return this.index<this.values.length-1;}
  record(value: ProfileEditorDraft) {
    if(draftKey(value)===draftKey(this.values[this.index]))return;
    this.values=this.values.slice(0,this.index+1);this.values.push(value);
    if(this.values.length>40)this.values.shift();
    this.index=this.values.length-1;
  }
  undo() {if(this.canUndo)this.index--;return this.values[this.index];}
  redo() {if(this.canRedo)this.index++;return this.values[this.index];}
}
const DB_NAME='animebox-profile-drafts-v1';
export const DRAFT_TTL=7*24*60*60*1000;
export type StoredProfileDraft={version:1;userId:string;updatedAt:number;draft:ProfileEditorDraft};
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'userId'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function profileDraftStorage(userId:string, action:'read'|'write'|'delete', draft?:ProfileEditorDraft):Promise<StoredProfileDraft|null> {
  const db=await database();
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',action==='read'?'readonly':'readwrite');
    const store=tx.objectStore('drafts');
    const request=action==='read'?store.get(userId):action==='delete'?store.delete(userId):store.put({version:1,userId,updatedAt:Date.now(),draft});
    let result:StoredProfileDraft|null=null;
    request.onsuccess=()=>{if(action==='read'){
      const item=request.result as StoredProfileDraft|undefined;
      if(item?.version===1&&item.userId===userId&&Date.now()-item.updatedAt<DRAFT_TTL&&typeof item.draft?.username==='string')result=item;
    }};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
