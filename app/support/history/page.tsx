import type { Metadata } from 'next';
import Link from 'next/link';

import SupportHistoryClient from '@/components/monetization/SupportHistoryClient';

export const metadata: Metadata = {
  title: 'История поддержки',
  description: 'История платежей и поддержки AnimeBox.',
  robots: { index: false, follow: false },
};

export default function SupportHistoryPage() {
  return (
    <main className="support-history-page">
      <div className="support-history-head">
        <span>ANIMEBOX · ПЛАТЕЖИ</span>
        <h1>История поддержки</h1>
        <p>Все связанные с аккаунтом платежи, возвраты и состояние проверки в одном месте.</p>
        <div>
          <Link href="/support">← Поддержка</Link>
          <Link href="/settings/sponsor">Оформление спонсора →</Link>
        </div>
      </div>
      <SupportHistoryClient />
    </main>
  );
}
