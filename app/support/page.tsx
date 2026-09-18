import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import SupportAnimeBox from '@/components/monetization/SupportAnimeBox';
import SponsorDashboard from '@/components/monetization/SponsorDashboard';
import SponsorBadge from '@/components/monetization/SponsorBadge';
import AnimeBoxStar from '@/components/monetization/AnimeBoxStar';
import { SUPPORT_EMAIL, buildSupportMailto } from '@/lib/contact';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';
export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Спонсорство AnimeBox',
  description: 'Поддержи AnimeBox и открой оформление профиля за Telegram Stars.',
  path: '/support',
});
const tiers=[
 {tier:'supporter' as const,amount:25,title:'Ты — часть проекта',perks:['Бейдж «Спонсор»','Supporter-рамка и стиль ника','Статус в профиле, комментариях и лидерборде']},
 {tier:'premium' as const,amount:100,title:'Больше индивидуальности',perks:['Все преимущества спонсора','Premium-рамка и стили ника','Violet / Aurora темы профиля','Без будущей рекламы']},
 {tier:'patron' as const,amount:250,title:'Меценат AnimeBox',perks:['Все преимущества Premium','Patron-рамка и золотой стиль','Royal тема профиля','Особый значок мецената']},
];
export default function SupportPage(){return <div className="support-page sponsor-v2-page">
 <section className="support-page__hero">
  <div className="support-page__hero-copy">
   <span className="support-page__eyebrow">ANIMEBOX · СОЗДАЁМ ВМЕСТЕ</span>
   <h1>Твоя поддержка.<br/>Будущее AnimeBox.</h1>
   <p>Помоги независимому проекту расти — и добавь своему профилю характер. Каждая звезда идёт в общий прогресс твоего спонсорства.</p>
  </div>
  <Image src="/brand/illustrations/support-stars.webp" width={720} height={480} alt="" aria-hidden="true" className="support-page__hero-art" priority unoptimized/>
 </section>
 <SponsorDashboard/>
 <section aria-label="Уровни спонсорства" className="sponsor-v2-tiers">{tiers.map(t=><article className="sponsor-v2-tier" data-tier={t.tier} key={t.tier}><SponsorBadge tier={t.tier}/><div className="sponsor-v2-price"><strong>{t.amount}</strong><span className="sponsor-v2-price__stars"><AnimeBoxStar size={22} /> суммарно</span></div><h2>{t.title}</h2><ul>{t.perks.map(p=><li key={p}>{p}</li>)}</ul><a className="btn btn--ghost" href="#support-payment">Поддержать проект ↓</a></article>)}</section>
 <div id="support-payment"><SupportAnimeBox/></div>
 <section className="sponsor-v2-panel"><h2>Как это работает</h2><p>Поддержка накопительная: несколько платежей складываются в общий прогресс. Ежемесячного списания нет.</p><p>Если статус не обновился сразу после оплаты, подожди немного и нажми «Обновить». Платёж должен получить подтверждение от Telegram.</p><p>В настройках спонсора можно выбрать открытую рамку, стиль ника, тему профиля и решить, показываться ли на стене спонсоров.</p><p><Link href="/settings/sponsor">Настроить оформление →</Link> · <Link href="/supporters">Рейтинг спонсоров →</Link></p><p>Проблема с оплатой или статусом? <a href={buildSupportMailto('AnimeBox — вопрос по поддержке')}>{SUPPORT_EMAIL}</a></p><Link href="/support/history">История всех платежей →</Link></section>
 <div className="support-page__back"><Link href="/">← На главную</Link></div>
 </div>;}
