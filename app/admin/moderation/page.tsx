'use client';

import Link from 'next/link';
import { useEffect,useState } from 'react';
type Comment={id:string;user_id:string|null;username:string;anime_id:number;animeTitle:string;episode_number:number|null;body:string;created_at:string;deleted_at:string|null};
type Data={comments:Comment[];page:number;hasMore:boolean};
export default function Moderation(){
 const [data,setData]=useState<Data|null>(null),[state,setState]=useState('all'),[page,setPage]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const c=new AbortController();setError('');fetch(`/api/admin/comments?page=${page}&state=${state}`,{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');setData(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[page,state,refresh]);
 async function act(comment:Comment,action:'remove'|'restore'){
  const reason=action==='remove'?window.prompt('Причина удаления комментария:','Нарушение правил')?.trim():'';if(action==='remove'&&!reason)return;
  if(!window.confirm(action==='remove'?'Скрыть этот комментарий?':'Восстановить исходный текст комментария?'))return;
  setBusy(comment.id);try{const r=await fetch('/api/admin/comments',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:comment.id,action,reason})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');setRefresh(x=>x+1)}catch(e){setError(e instanceof Error?e.message:'Ошибка')}finally{setBusy('')}
 }
 return <main className="admin-v1-page"><header className="admin-v1-header"><div><span>СООБЩЕСТВО</span><h1>Модерация комментариев</h1><p>Просмотр, скрытие и восстановление сообщений с записью причины.</p></div></header>
  <div className="admin-v1-tabs">{[['all','Все'],['visible','Опубликованные'],['removed','Скрытые']].map(([key,label])=><button className={state===key?'is-active':''} key={key} onClick={()=>{setState(key);setPage(1)}}>{label}</button>)}</div>
  {error&&<div className="admin-v1-error">{error}</div>}
  <section className="admin-v1-comments">{data?.comments.map(comment=><article key={comment.id} className={comment.deleted_at?'is-removed':''}><div className="admin-v1-comment-meta"><div><Link href={comment.user_id?`/profile/${comment.user_id}`:'#'}>{comment.username}</Link><span>в</span><Link href={`/anime/${comment.anime_id}`}>{comment.animeTitle}</Link>{comment.episode_number&&<span>· серия {comment.episode_number}</span>}</div><time>{new Date(comment.created_at).toLocaleString('ru-RU')}</time></div><p>{comment.body}</p><footer><code>{comment.id}</code>{comment.deleted_at?<button disabled={busy===comment.id} onClick={()=>act(comment,'restore')}>Восстановить</button>:<button className="is-danger" disabled={busy===comment.id} onClick={()=>act(comment,'remove')}>Скрыть</button>}</footer></article>)}{data&&!data.comments.length&&<div className="admin-v1-empty">В этом разделе комментариев нет.</div>}</section>
  <div className="admin-v1-pager"><button disabled={page===1} onClick={()=>setPage(x=>x-1)}>← Назад</button><span>Страница {page}</span><button disabled={!data?.hasMore} onClick={()=>setPage(x=>x+1)}>Дальше →</button></div>
 </main>
}
