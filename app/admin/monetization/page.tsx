'use client';
import {useEffect,useState} from 'react';
import SponsorBadge from '@/components/monetization/SponsorBadge';
import type {SponsorTier} from '@/lib/sponsor';
type Data={metrics:{total_stars:number;payment_count:number;sponsors:number;supporter:number;premium:number;patron:number};payments:{id:string;user_id:string|null;amount:number;created_at:string}[];sponsors:{account_key:string;user_id:string|null;total_stars:number;sponsor_tier:SponsorTier|null}[];profiles:{id:string;username:string|null}[];hasMore:boolean};
export default function MonetizationAdmin(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');fetch(`/api/admin/monetization?page=${page}`,{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Нет доступа');setData(d);}).catch(e=>{if(!c.signal.aborted){setError(e.message);setData(null);}}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[page,refresh]);
 const name=(id:string|null)=>id?(data?.profiles.find(p=>p.id===id)?.username||id):'Telegram · без привязки';
 return <main className="sponsor-v2-admin"><h1>Монетизация AnimeBox</h1><button disabled={loading} onClick={()=>setRefresh(x=>x+1)}>Обновить данные</button>{loading&&<p role="status">Загрузка…</p>}{error&&<p role="alert">{error}</p>}{data&&<>
 <p className="sponsor-v2-note">Полученные Stars — не сумма вывода в деньгах. DonatePay здесь не учитывается.</p>
 <div className="sponsor-v2-metrics"><div>Получено<strong>{Number(data.metrics.total_stars).toLocaleString('ru-RU')} ⭐</strong></div><div>Спонсоров<strong>{data.metrics.sponsors}</strong></div><div>Платежей<strong>{data.metrics.payment_count}</strong></div></div>
 <h2>Распределение по уровням</h2><p>Спонсор: {data.metrics.supporter} · Premium: {data.metrics.premium} · Меценат: {data.metrics.patron}</p>
 <h2>Кто поддержал</h2><div className="sponsor-v2-table"><table><thead><tr><th>Пользователь</th><th>Всего</th><th>Уровень</th></tr></thead><tbody>{data.sponsors.map(s=><tr key={s.account_key}><td>{name(s.user_id)}</td><td>{s.total_stars} ⭐</td><td>{s.sponsor_tier?<SponsorBadge tier={s.sponsor_tier}/>: '—'}</td></tr>)}</tbody></table>{!data.sponsors.length&&<p>Пока нет спонсоров.</p>}</div>
 <h2>Платежи · сначала новые</h2><div className="sponsor-v2-table"><table><thead><tr><th>Дата</th><th>Пользователь</th><th>Stars</th></tr></thead><tbody>{data.payments.map(p=><tr key={p.id}><td>{new Date(p.created_at).toLocaleString('ru-RU')}</td><td>{name(p.user_id)}</td><td>+{p.amount} ⭐</td></tr>)}</tbody></table>{!data.payments.length&&<p>Пока нет платежей.</p>}</div>
 <div className="sponsor-v2-pager"><button disabled={page===1||loading} onClick={()=>setPage(x=>x-1)}>← Назад</button><span>Страница {page}</span><button disabled={!data.hasMore||loading} onClick={()=>setPage(x=>x+1)}>Дальше →</button></div>
 </>}</main>;
}
