import type { Metadata } from 'next';
import Link from 'next/link';

import CopyrightReportForm from '@/components/CopyrightReportForm';
import { COPYRIGHT_EMAIL } from '@/lib/contact';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Правообладателям',
  description:
    'Контакт и форма AnimeBox для обращений правообладателей и их уполномоченных представителей.',
  path: '/copyright',
});

export default function CopyrightPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
      <section className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(17,22,34,.98),rgba(9,13,21,.99))] px-5 py-8 md:px-8 md:py-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-violet-300/65">
          ANIMEBOX · RIGHTS HOLDERS
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">
          Правообладателям
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55 md:text-base">
          AnimeBox уважает интеллектуальные права третьих лиц. Если ты являешься
          правообладателем или уполномоченным представителем и считаешь, что
          конкретный материал на AnimeBox затрагивает твои права, отправь
          достаточно конкретное обращение через форму ниже.
        </p>
        <p className="mt-3 text-xs leading-6 text-white/35">
          Контакт для обращений:{' '}
          <a
            className="text-violet-300/80"
            href={'mailto:' + COPYRIGHT_EMAIL}
          >
            {COPYRIGHT_EMAIL}
          </a>
        </p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-300/55">01</span>
          <h2 className="mt-2 text-base font-extrabold">Укажи точный материал</h2>
          <p className="mt-2 text-xs leading-6 text-white/40">
            Нужны конкретные URL AnimeBox и произведение, к которому относится обращение.
          </p>
        </article>
        <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-300/55">02</span>
          <h2 className="mt-2 text-base font-extrabold">Опиши основание</h2>
          <p className="mt-2 text-xs leading-6 text-white/40">
            Укажи заявленные права и почему ты вправе направлять обращение от своего имени или от имени правообладателя.
          </p>
        </article>
        <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-300/55">03</span>
          <h2 className="mt-2 text-base font-extrabold">Мы зафиксируем дело</h2>
          <p className="mt-2 text-xs leading-6 text-white/40">
            После отправки форма выдаст номер дела. AnimeBox сможет запросить дополнительную информацию или ограничить спорный источник.
          </p>
        </article>
      </div>

      <section className="mt-7">
        <div className="mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300/55">
            COPYRIGHT REPORT
          </span>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">Отправить обращение</h2>
        </div>
        <CopyrightReportForm />
      </section>

      <section className="mt-7 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 md:p-6">
        <h2 className="text-lg font-extrabold">Что происходит после обращения</h2>
        <p className="mt-3 text-sm leading-7 text-white/45">
          AnimeBox проверяет, достаточно ли конкретно описан спорный материал и
          основание обращения. При необходимости мы можем запросить дополнительные
          сведения. Если принимается решение об ограничении, система позволяет
          отключить конкретный тайтл, сезон, эпизод или источник просмотра без
          автоматического повторного подключения этого источника.
        </p>
        <p className="mt-3 text-xs leading-6 text-white/32">
          Эта страница описывает процедуру связи с AnimeBox и не является заявлением
          о применимости какой-либо конкретной юридической защиты или процедуры.
          Если твоё уведомление направляется в рамках определённого закона или
          процедуры, включи сведения, которые требуются этой процедурой.
        </p>
      </section>

      <section
        lang="en"
        className="mt-4 rounded-2xl border border-white/[0.06] bg-black/10 p-5"
      >
        <h2 className="text-sm font-extrabold text-white/75">For rights holders</h2>
        <p className="mt-2 text-xs leading-6 text-white/38">
          If you are a rights holder or an authorized representative, provide the
          exact AnimeBox URLs, identify the work and rights at issue, explain your
          authority, and include a valid contact email. You may also contact{' '}
          <a
            className="text-violet-300/75"
            href={'mailto:' + COPYRIGHT_EMAIL}
          >
            {COPYRIGHT_EMAIL}
          </a>.
        </p>
      </section>

      <div className="mt-7 flex flex-wrap gap-4 text-xs text-white/40">
        <Link href="/terms" className="hover:text-white/70">Условия использования</Link>
        <Link href="/about" className="hover:text-white/70">О проекте</Link>
      </div>
    </main>
  );
}
