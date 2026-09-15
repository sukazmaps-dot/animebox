import Link from 'next/link';
import Icon from '@/components/Icon';

const telegramUrl = 'https://t.me/yourAnimeBox';
const donateUrl = 'https://donatepay.ru/don/Armlet';

export default function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <span className="about-hero__eyebrow">ANIMEBOX · BETA</span>
        <h1>Смотри. Отслеживай. Живи.</h1>
        <p>
          AnimeBox — тестовая версия сервиса для поиска аниме, расписания новых серий,
          трекера просмотра и избранного. Проект ещё развивается, поэтому интерфейс и
          отдельные функции могут меняться.
        </p>

        <div className="about-hero__actions">
          <Link href="/search" className="btn btn--primary">
            Смотреть каталог
          </Link>
          <a href={telegramUrl} target="_blank" rel="noreferrer" className="btn btn--ghost">
            <Icon name="telegram" />
            Telegram
          </a>
          <a href={donateUrl} target="_blank" rel="noreferrer" className="btn btn--ghost">
            <Icon name="heart" />
            Поддержать AnimeBox
          </a>
        </div>
      </section>

      <section className="about-grid">
        <article className="about-card">
          <Icon name="anime" />
          <h2>Каталог</h2>
          <p>Поиск, карточки тайтлов, русские названия, рейтинги и основные данные.</p>
        </article>

        <article className="about-card">
          <Icon name="calendar" />
          <h2>Расписание</h2>
          <p>Ближайшие эпизоды и удобное переключение между днями недели.</p>
        </article>

        <article className="about-card">
          <Icon name="tracker" />
          <h2>Трекер</h2>
          <p>Прогресс просмотра, история и быстрый переход к следующей серии.</p>
        </article>

        <article className="about-card">
          <Icon name="heart" />
          <h2>Избранное</h2>
          <p>Сохраняй понравившиеся тайтлы и возвращайся к ним позже.</p>
        </article>
      </section>

      <section className="about-status">
        <div>
          <span>Текущий статус</span>
          <strong>Публичная тестовая версия</strong>
        </div>
        <p>
          Если заметишь баг или хочешь предложить идею, напиши в Telegram. Новые функции
          будут добавляться постепенно.
        </p>
      </section>
    </div>
  );
}
