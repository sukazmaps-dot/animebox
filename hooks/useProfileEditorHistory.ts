'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {draftKey,ProfileDraftHistory,profileDraftStorage,type ProfileEditorDraft,type StoredProfileDraft} from '@/lib/profile-editor-draft';

export function useProfileEditorHistory({userId,ready,baseline,draft,dirty,onApply}:{
  userId:string|null;ready:boolean;baseline:string;draft:ProfileEditorDraft;dirty:boolean;
  onApply:(draft:ProfileEditorDraft)=>void;
}) {
  const history=useRef<ProfileDraftHistory|null>(null);
  const [available,setAvailable]=useState({undo:false,redo:false});
  const [recovery,setRecovery]=useState<StoredProfileDraft|null>(null);
  const [notice,setNotice]=useState('');
  const storageReady=useRef(false);
  const latest=useRef({draft,dirty,onApply});
  useEffect(()=>{latest.current={draft,dirty,onApply};},[draft,dirty,onApply]);
  const sync=useCallback(()=>setAvailable({undo:!!history.current?.canUndo,redo:!!history.current?.canRedo}),[]);
  useEffect(()=>{
    if(!ready)return;
    history.current=new ProfileDraftHistory(latest.current.draft);
    const frame=requestAnimationFrame(sync);
    return()=>cancelAnimationFrame(frame);
  },[ready,baseline,sync]);
  useEffect(()=>{
    if(!ready||!userId)return;
    let active=true;storageReady.current=false;
    void profileDraftStorage(userId,'read').then(item=>{
      if(!active)return;
      if(item&&draftKey(item.draft)!==draftKey(latest.current.draft))setRecovery(item);
      storageReady.current=true;
    }).catch(()=>{if(active){storageReady.current=true;setNotice('Браузер не разрешил сохранять черновик на устройстве.');}});
    return()=>{active=false;};
  },[ready,userId]);
  useEffect(()=>{
    if(!ready)return;
    const timer=setTimeout(()=>{history.current?.record(draft);sync();},250);
    return()=>clearTimeout(timer);
  },[ready,draft,sync]);
  useEffect(()=>{
    if(!ready||!userId||recovery)return;
    const timer=setTimeout(()=>{
      if(!storageReady.current)return;
      void profileDraftStorage(userId,dirty?'write':'delete',draft).catch(()=>setNotice('Не удалось сохранить локальный черновик.'));
    },600);
    return()=>clearTimeout(timer);
  },[ready,userId,draft,dirty,recovery]);
  // Flush on reload/tab suspension, including structured-cloneable staged image files.
  useEffect(()=>{
    if(!ready||!userId)return;
    const flush=()=>{if(storageReady.current&&!recovery&&latest.current.dirty)void profileDraftStorage(userId,'write',latest.current.draft).catch(()=>{});};
    window.addEventListener('pagehide',flush);
    const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    document.addEventListener('visibilitychange',hidden);
    return()=>{flush();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);};
  },[ready,userId,recovery]);
  const undo=()=>{history.current?.record(draft);const value=history.current?.undo();if(value)onApply(value);sync();};
  const redo=()=>{const value=history.current?.redo();if(value)onApply(value);sync();};
  const checkpoint=()=>{history.current?.record(draft);sync();};
  const restore=()=>{if(recovery){checkpoint();onApply(recovery.draft);setRecovery(null);setNotice('Черновик восстановлен. Файлы ещё не отправлены.');}};
  const discard=()=>{setRecovery(null);if(userId)void profileDraftStorage(userId,'delete').catch(()=>{});};
  return {canUndo:available.undo,canRedo:available.redo,undo,redo,checkpoint,recovery,restore,discard,notice};
}
