'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SponsorBadge from './SponsorBadge';
import AnimeBoxStar from './AnimeBoxStar';
import SponsorProgressBar from './SponsorProgressBar';
import { SPONSOR_META, type SponsorStatus } from '@/lib/sponsor';

type Data = { sponsor: SponsorStatus | null; totalStars:number; telegramLinked:boolean; payments:{id:string;amount:number;created_at:string}[]; page:number;hasMore:boolean };
export default function SponsorDashboard({history=false}:{history?:boolean}) {
 const [data,setData]=useState<Data|null>(null);
 const [error,setError]=useState('');
 const [guest,setGuest]=useState(false);
 const [page,setPage]=useState(1);
 const [loading,setLoading]=useState(true);
 const [refresh,setRefresh]=useState(0);
 const reload=useCallback(()=>setRefresh(x=>x+1),[]);
 useEffect(()=>{
  window.addEventListener('animebox:support-paid',reload);
  window.addEventListener('focus',reload);
  return ()=>{window.removeEventListener('animebox:support-paid',reload);window.removeEventListener('focus',reload);};
 },[reload]);
 useEffect(()=>{
  const controller=new AbortController();
  queueMicrotask(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});
  fetch(`/api/monetization/sponsor/me?page=${page}`,{cache:'no-store',signal:controller.signal})
   .then(async r=>{if(r.status===401){setGuest(true);setData(null);return;}const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось загрузить поддержку');setGuest(false);setData(d);})
   .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[page,refresh]);
 const next=[25,100,250].find(x=>x>(data?.totalStars??0));
 return <section className="sponsor-v2-panel" aria-busy={loading}>
  <div className="sponsor-v2-heading"><div><span className="sponsor-v2-eyebrow">ТВОЙ ВКЛАД</span><h2>{history?'История поддержки':'Твой путь спонсора'}</h2></div><button className="btn btn--ghost" onClick={reload} disabled={loading}>Обновить</button></div>
  {loading&&!data&&<p role="status">Загружаем прогресс…</p>}
  {error&&<p role="alert">{error} <button onClick={reload}>Повторить</button></p>}
  {guest&&<p><Link href="/profile">Войди в аккаунт</Link>, чтобы видеть свой прогресс и историю поддержки.</p>}
  {data&&<>
   <div className="sponsor-v2-total"><strong>{data.totalStars.toLocaleString('ru-RU')} <AnimeBoxStar size={30} className="animebox-star-icon--pulse" /></strong>{data.sponsor&&<SponsorBadge tier={data.sponsor.tier}/>}</div>
   {next ? (
    <p className="sponsor-v2-next">
      До уровня <strong>{SPONSOR_META[next===25?'supporter':next===100?'premium':'patron'].label}</strong> осталось
      <span className="sponsor-v2-next__amount">{next-data.totalStars} <AnimeBoxStar size={20} className="animebox-star-icon--pulse" /></span>
    </p>
   ) : (
    <p className="sponsor-v2-next sponsor-v2-next--complete">
      Высший уровень открыт <AnimeBoxStar size={20} className="animebox-star-icon--pulse" /> Спасибо за поддержку AnimeBox!
    </p>
   )}
   <SponsorProgressBar
     current={next ? data.totalStars : 250}
     target={next ?? 250}
     label="Прогресс спонсорства"
   />
   {!data.telegramLinked&&<p className="sponsor-v2-note">Для автоматического получения статуса привяжи Telegram к своему аккаунту в профиле. Stars учитываются по аккаунту плательщика в Telegram.</p>}
   {history&&<>
    {data.payments.length?<ul className="sponsor-v2-history">{data.payments.map(p=><li key={p.id}><time dateTime={p.created_at}>{new Date(p.created_at).toLocaleString('ru-RU')}</time><strong>+{p.amount} <AnimeBoxStar size={20} /></strong></li>)}</ul>:<p>Здесь появится твоя первая поддержка через Stars.</p>}
    <div className="sponsor-v2-pager"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>← Назад</button><span>Страница {page}</span><button disabled={!data.hasMore||loading} onClick={()=>setPage(p=>p+1)}>Дальше →</button></div>
   </>}
  </>}
  <p className="sponsor-v2-note">Уровни накопительные. Учитываются подтверждённые Telegram Stars. Поддержка через DonatePay пока не начисляет статус автоматически.</p>
 </section>;
}
