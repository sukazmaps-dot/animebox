import Icon from '@/components/Icon';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

export default function TelegramPromoCard() {
  return (
    <section className="panel home-utility-card home-utility-card--telegram">
      <div className="home-utility-card__icon" aria-hidden="true">
        <Icon name="telegram" />
      </div>

      <div className="home-utility-card__copy">
        <span>Telegram</span>
        <strong>Новые серии без проверки вручную</strong>
        <p>AnimeBox напишет, когда серия реально появится в плеере.</p>
      </div>

      <a
        href={TELEGRAM_MINI_APP_URL}
        target="_blank"
        rel="noreferrer"
        className="home-utility-card__link"
      >
        Открыть Mini App
        <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
