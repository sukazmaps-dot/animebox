import type { Metadata } from 'next';
import Link from 'next/link';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Условия поддержки AnimeBox',
  description: 'Условия добровольной поддержки и AnimeBox Premium.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <div className="support-page support-terms">
      <section className="support-page__hero">
        <span className="support-page__eyebrow">ANIMEBOX · TERMS</span>
        <h1>Условия поддержки</h1>
        <p>
          Здесь описана добровольная поддержка проекта и отдельный продукт AnimeBox Premium.
        </p>
      </section>

      <section className="support-terms__card">
        <h2>Что означает поддержка</h2>
        <p>
          Платёж является добровольной поддержкой разработки AnimeBox и сам по себе не предоставляет подписку, эксклюзивный контент или гарантированный набор функций.
        </p>

        <h2>AnimeBox Premium</h2>
        <p>
          AnimeBox Premium является отдельным платным доступом на выбранный срок.
          Он не считается добровольным донатом: после подтверждённой оплаты
          аккаунту выдаются указанные на странице Premium возможности до даты
          окончания доступа. Повторная покупка добавляет новый срок к уже
          действующему Premium.
        </p>

        <h2>Автопродление Premium</h2>
        <p>
          Месячный AnimeBox Premium, оплаченный через Telegram Stars, может
          продлеваться автоматически каждые 30 дней. Перед оплатой Telegram
          показывает условия подписки. Автопродление можно отключить на
          странице Premium; уже оплаченный доступ при этом сохраняется до
          конца текущего периода. Годовой тариф является предоплаченным и
          автоматически не продлевается.
        </p>

        <h2>Telegram Stars</h2>
        <p>
          Через Telegram Stars могут проходить как добровольная поддержка, так и покупка Premium. Тип платежа указывается до оплаты, а финальное подтверждение выполняется интерфейсом Telegram.
        </p>

        <h2>Проблемы с платежом</h2>
        <p>
          Если платёж прошёл некорректно, используй команду <strong>/paysupport</strong> в @YourAnimeBoxBot и укажи, что произошло.
        </p>

        <h2>Изменения</h2>
        <p>
          Условия могут обновляться вместе с развитием системы монетизации. Существенные изменения будут отражены на этой странице.
        </p>
      </section>

      <div className="support-page__back">
        <Link href="/support">← Назад к поддержке</Link>
      </div>
    </div>
  );
}
