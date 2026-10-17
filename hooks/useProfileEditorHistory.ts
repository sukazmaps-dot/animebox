'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {draftKey,ProfileDraftHistory,profileDraftStorage,runProfileDraftOperation,type ProfileEditorDraft,type StoredProfileDraft} from '@/lib/profile-editor-draft';

export function useProfileEditorHistory({userId,ready,baseline,draft,dirty,onApply}:{
  userId:string|null;ready:boolean;baseline:string;draft:ProfileEditorDraft;dirty:boolean;
  onApply:(draft:ProfileEditorDraft)=>void;
}) {
  const history=useRef<ProfileDraftHistory|null>(null);
  const [available,setAvailable]=useState({undo:false,redo:false});
  const [recovery,setRecovery]=useState<StoredProfileDraft|null>(null);
  const [notice,setNotice]=useState('');
  const storageReady=useRef(false);
  // Clear is a save boundary: stale debounced/pagehide writes must never
  // recreate a draft that the user just committed or explicitly discarded.
  const storageRevision=useRef(0);
  const clearedDraft=useRef<ProfileEditorDraft|null>(null);
  const latest=useRef({draft,dirty,onApply});
  const queueWrite=useCallback((id:string,value:ProfileEditorDraft)=>{
    const revision=storageRevision.current;
    // Only suppress the exact pre-save snapshot; retyping identical content
    // later creates a new draft object and must persist normally.
    if(value===clearedDraft.current)return Promise.resolve(null);
    return runProfileDraftOperation(id,()=>revision===storageRevision.current
      ? profileDraftStorage(id,'write',value)
      : Promise.resolve(null));
  },[]);
  const queueDelete=useCallback((id:string)=>{
    const revision=++storageRevision.current;
    clearedDraft.current=latest.current.draft;
    return runProfileDraftOperation(id,()=>revision===storageRevision.current
      ? profileDraftStorage(id,'delete')
      : Promise.resolve(null));
  },[]);
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
    void runProfileDraftOperation(userId,()=>profileDraftStorage(userId,'read')).then(item=>{
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
      void (dirty ? queueWrite(userId,draft) : runProfileDraftOperation(userId,()=>profileDraftStorage(userId,'delete')))
        .catch(()=>setNotice('Не удалось сохранить локальный черновик.'));
    },600);
    return()=>clearTimeout(timer);
  },[ready,userId,draft,dirty,recovery,queueWrite]);
  // Flush on reload/tab suspension, including structured-cloneable staged image files.
  useEffect(()=>{
    if(!ready||!userId)return;
    const flush=()=>{if(storageReady.current&&!recovery&&latest.current.dirty)
      void queueWrite(userId,latest.current.draft).catch(()=>{});};
    window.addEventListener('pagehide',flush);
    const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    document.addEventListener('visibilitychange',hidden);
    return()=>{flush();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);};
  },[ready,userId,recovery,queueWrite]);
  const undo=()=>{history.current?.record(draft);const value=history.current?.undo();if(value)onApply(value);sync();};
  const redo=()=>{const value=history.current?.redo();if(value)onApply(value);sync();};
  const checkpoint=()=>{history.current?.record(draft);sync();};
  const restore=()=>{if(recovery){clearedDraft.current=null;checkpoint();onApply(recovery.draft);setRecovery(null);setNotice('Черновик восстановлен. Файлы ещё не отправлены.');}};
  const discard=()=>{
    setRecovery(null);
    if(userId)void queueDelete(userId).catch(()=>setNotice('Не удалось удалить локальный черновик.'));
  };
  return {canUndo:available.undo,canRedo:available.redo,undo,redo,checkpoint,recovery,restore,discard,notice};
}
