import Link from 'next/link';

import { buildSupportMailto, SUPPORT_EMAIL } from '@/lib/contact';
import { BRAND_SLOGAN } from '@/lib/brand';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

export default function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Ссылки AnimeBox">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <strong>AnimeBox</strong>
          <span>{BRAND_SLOGAN}</span>
        </div>

        <nav className="site-footer__links" aria-label="Сервисные ссылки">
          <Link href="/about">О проекте</Link>
          <Link href="/copyright">Правообладателям</Link>
          <Link href="/terms">Условия</Link>
          <a href={buildSupportMailto('Поддержка AnimeBox')}>Поддержка · {SUPPORT_EMAIL}</a>
          <a href={TELEGRAM_MINI_APP_URL} target="_blank" rel="noreferrer">
            Telegram Mini App
          </a>
          <Link href="/premium">AnimeBox Premium</Link>
        </nav>
      </div>
    </footer>
  );
}
