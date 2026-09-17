'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type UserRow={id:string;username:string|null;email:string|null;avatarUrl:string;telegram_id:number|string|null;created_at:string;status:'active'|'muted'|'banned';note:string|null;expiresAt:string|null;totalStars:number;sponsorTier:string|null;adminRole:string|null};
type Data={role:string;users:UserRow[];page:number;hasMore:boolean;total:number};

const statusLabel={active:'Активен',muted:'Мут',banned:'Заблокирован'};

export default function AdminUsers(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[q,setQ]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState('');
 useEffect(()=>{const c=new AbortController();setError('');fetch(`/api/admin/users?page=${page}&q=${encodeURIComponent(search)}`,{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort();},[page,search,refresh]);
 function submit(e:FormEvent){e.preventDefault();setPage(1);setSearch(q.trim());}
 async function changeStatus(user:UserRow,status:UserRow['status']){
  const note=status==='active'?'':window.prompt('Причина ограничения (видна только администрации):',user.note||'')?.trim();
  if(status!=='active'&&!note)return;
  let expiresAt:string|null=null;
  if(status==='muted'){
   const duration=window.prompt('Срок мута: 24h, 7d или permanent','24h');if(!duration)return;
   expiresAt=duration==='24h'?new Date(Date.now()+86400000).toISOString():duration==='7d'?new Date(Date.now()+604800000).toISOString():null;
  }
  if(!window.confirm(`${status==='active'?'Снять ограничения с':'Изменить статус для'} ${user.username||user.id}?`))return;
  setBusy(user.id);setError('');
  try{const r=await fetch('/api/admin/users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,status,note,expiresAt})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');setRefresh(x=>x+1);}catch(e){setError(e instanceof Error?e.message:'Ошибка')}finally{setBusy('')}
 }
 return <main className="admin-v1-page"><header className="admin-v1-header"><div><span>АУДИТОРИЯ</span><h1>Пользователи</h1><p>Поиск аккаунтов и управление возможностью писать комментарии.</p></div><em>{data?.total??'—'} аккаунтов</em></header>
  <form className="admin-v1-search" onSubmit={submit}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Никнейм или UUID пользователя"/><button>Найти</button>{search&&<button type="button" className="is-ghost" onClick={()=>{setQ('');setSearch('');setPage(1)}}>Сбросить</button>}</form>
  {error&&<div className="admin-v1-error">{error}</div>}
  <div className="admin-v1-table-wrap"><table className="admin-v1-table"><thead><tr><th>Пользователь</th><th>Регистрация</th><th>Telegram</th><th>Поддержка</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{data?.users.map(user=><tr key={user.id}><td><Link className="admin-v1-user" href={`/profile/${user.id}`}><img src={user.avatarUrl} alt=""/><span><strong>{user.username||'Пользователь'} {user.adminRole&&<b>{user.adminRole}</b>}</strong><small>{user.email||user.id}</small></span></Link></td><td>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td><td>{user.telegram_id?'Привязан':'—'}</td><td>{user.totalStars?`${user.totalStars} ⭐`:'—'}</td><td><span className="admin-v1-status" data-status={user.status}>{statusLabel[user.status]}</span>{user.expiresAt&&<small className="admin-v1-expire">до {new Date(user.expiresAt).toLocaleString('ru-RU')}</small>}</td><td><div className="admin-v1-actions"><button disabled={busy===user.id} onClick={()=>changeStatus(user,'active')}>Снять</button><button disabled={busy===user.id} onClick={()=>changeStatus(user,'muted')}>Мут</button><button className="is-danger" disabled={busy===user.id} onClick={()=>changeStatus(user,'banned')}>Блок</button></div></td></tr>)}</tbody></table>{data&&!data.users.length&&<div className="admin-v1-empty">Пользователи не найдены.</div>}</div>
  <div className="admin-v1-pager"><button disabled={page===1} onClick={()=>setPage(x=>x-1)}>← Назад</button><span>Страница {page}</span><button disabled={!data?.hasMore} onClick={()=>setPage(x=>x+1)}>Дальше →</button></div>
 </main>
}
