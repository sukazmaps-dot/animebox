import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Условия поддержки AnimeBox',
  description: 'Условия добровольной поддержки проекта AnimeBox.',
};

export default function TermsPage() {
  return (
    <div className="support-page support-terms">
      <section className="support-page__hero">
        <span className="support-page__eyebrow">ANIMEBOX · TERMS</span>
        <h1>Условия поддержки</h1>
        <p>
          Эти условия относятся к добровольной финансовой поддержке AnimeBox.
        </p>
      </section>

      <section className="support-terms__card">
        <h2>Что означает поддержка</h2>
        <p>
          Платёж является добровольной поддержкой разработки AnimeBox и сам по себе не предоставляет подписку, эксклюзивный контент или гарантированный набор функций.
        </p>

        <h2>Telegram Stars</h2>
        <p>
          В Telegram Mini App поддержка принимается через Telegram Stars. Финальное подтверждение платежа выполняется интерфейсом Telegram.
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
