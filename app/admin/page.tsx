'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Overview = {
  role: string;
  periodDays: number;
  metrics: { users:number;newUsers:number;comments:number;newComments:number;libraryItems:number;removedComments:number;stars:number;sponsors:number };
  recentUsers: { id:string;username:string|null;created_at:string }[];
  recentAudit: { id:number;action:string;target_type:string;target_id:string|null;created_at:string }[];
};

const actionLabels: Record<string,string> = {
  'user.status_changed':'Изменён статус пользователя',
  'comment.removed':'Комментарий удалён',
  'comment.restored':'Комментарий восстановлен',
};

export default function AdminOverview() {
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{const c=new AbortController();setError('');fetch('/api/admin/overview',{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка загрузки');setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[reload]);
  return <main className="admin-v1-page">
    <header className="admin-v1-header"><div><span>CONTROL CENTER</span><h1>Обзор AnimeBox</h1><p>Главные показатели и последние действия проекта.</p></div><button onClick={()=>setReload(x=>x+1)}>Обновить</button></header>
    {error&&<div className="admin-v1-error" role="alert">{error}</div>}
    {!data&&!error&&<div className="admin-v1-loading">Загружаем показатели…</div>}
    {data&&<>
      <section className="admin-v1-metrics" aria-label="Основные показатели">
        <article><span>Пользователи</span><strong>{data.metrics.users}</strong><small>+{data.metrics.newUsers} за {data.periodDays} дней</small></article>
        <article><span>Комментарии</span><strong>{data.metrics.comments}</strong><small>+{data.metrics.newComments} за {data.periodDays} дней</small></article>
        <article><span>Коллекции</span><strong>{data.metrics.libraryItems}</strong><small>Добавлений в списки</small></article>
        <article><span>Поддержка</span><strong>{data.metrics.stars} ⭐</strong><small>{data.metrics.sponsors} спонсоров</small></article>
      </section>
      <section className="admin-v1-grid">
        <article className="admin-v1-card"><div className="admin-v1-card-head"><div><span>НОВЫЕ АККАУНТЫ</span><h2>Последние регистрации</h2></div><Link href="/admin/users">Все пользователи →</Link></div>
          <div className="admin-v1-list">{data.recentUsers.map(user=><Link href={`/profile/${user.id}`} key={user.id}><div className="admin-v1-avatar">{(user.username||'?').slice(0,1).toUpperCase()}</div><div><strong>{user.username||'Пользователь'}</strong><small>{new Date(user.created_at).toLocaleString('ru-RU')}</small></div><span>↗</span></Link>)}</div>
        </article>
        <article className="admin-v1-card"><div className="admin-v1-card-head"><div><span>БЕЗОПАСНОСТЬ</span><h2>Последние действия</h2></div><Link href="/admin/audit">Открыть журнал →</Link></div>
          <div className="admin-v1-events">{data.recentAudit.length?data.recentAudit.map(event=><div key={event.id}><i/><div><strong>{actionLabels[event.action]||event.action}</strong><small>{new Date(event.created_at).toLocaleString('ru-RU')}</small></div></div>):<p>Административных действий пока нет.</p>}</div>
        </article>
      </section>
      <section className="admin-v1-quick"><Link href="/admin/moderation"><span>◇</span><div><strong>Очередь модерации</strong><small>{data.metrics.removedComments} скрытых комментариев</small></div><b>→</b></Link><Link href="/admin/monetization"><span>✦</span><div><strong>Монетизация</strong><small>Stars, спонсоры и платежи</small></div><b>→</b></Link></section>
    </>}
  </main>;
}
