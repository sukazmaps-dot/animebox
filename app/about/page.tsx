import Link from 'next/link';
import Icon from '@/components/Icon';

const telegramUrl = 'https://t.me/yourAnimeBox';
const donateUrl = 'https://donatepay.ru/don/Armlet';

const features = [
  {
    icon: 'anime' as const,
    title: 'Каталог и поиск',
    description:
      'Тысячи тайтлов из внешних anime API: русские названия, описания, рейтинги, жанры, франшизы и поиск без ручного хранения огромного каталога.',
  },
  {
    icon: 'tracker' as const,
    title: 'Трекер просмотра',
    description:
      'Статусы «Смотрю», «В планах», «Просмотрено» и «Брошено», прогресс по сериям и быстрый переход к продолжению просмотра.',
  },
  {
    icon: 'calendar' as const,
    title: 'Эпизоды и расписание',
    description:
      'Список серий, отметки просмотренного и расписание ближайших эпизодов, чтобы не терять новые релизы.',
  },
  {
    icon: 'spark' as const,
    title: 'Обсуждения серий',
    description:
      'Комментарии привязаны к конкретному эпизоду, поддерживают ответы и спойлеры — обсуждение одной серии не раскрывает события следующих.',
  },
  {
    icon: 'user' as const,
    title: 'Профиль и достижения',
    description:
      'Личный профиль, аватар и баннер, статистика просмотра, библиотека, комментарии и достижения за активность в AnimeBox.',
  },
  {
    icon: 'telegram' as const,
    title: 'Telegram',
    description:
      'AnimeBox развивается как единый веб-сервис и Telegram Mini App. Следующий крупный шаг — Mini App и уведомления о новых сериях.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page about-page--current">
      <section className="about-hero">
        <span className="about-hero__eyebrow">ANIMEBOX · PUBLIC BETA</span>

        <h1>Твоя аниме-библиотека, трекер и сообщество.</h1>

        <p>
          AnimeBox — развивающийся сервис для поиска аниме и ведения личной
          библиотеки. Здесь можно отслеживать просмотренные серии, продолжать с
          нужного эпизода, следить за расписанием, оформлять профиль и обсуждать
          каждую серию отдельно. Веб-версия уже является основным продуктом, а
          Telegram Mini App и уведомления станут её продолжением, а не отдельным
          сервисом.
        </p>

        <div className="about-hero__actions">
          <Link href="/search" className="btn btn--primary">
            Открыть каталог
          </Link>

          <Link href="/list" className="btn btn--ghost">
            <Icon name="tracker" />
            Мой трекер
          </Link>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn--ghost"
          >
            <Icon name="telegram" />
            Telegram
          </a>
        </div>
      </section>

      <section className="about-grid about-grid--current">
        {features.map((feature) => (
          <article className="about-card" key={feature.title}>
            <div className="about-card__icon" aria-hidden="true">
              <Icon name={feature.icon} />
            </div>

            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="about-status about-status--current">
        <div>
          <span>Состояние проекта</span>
          <strong>Публичная beta</strong>
        </div>

        <p>
          Сейчас основная работа сосредоточена на качестве веб-версии:
          интерфейсе, стабильности источников данных, трекере, профилях и
          сообществе. Далее — полноценная Telegram Mini App, уведомления и
          дальнейшая оптимизация. Если найдёшь баг или хочешь предложить идею,
          напиши в Telegram.
        </p>

        <a
          href={donateUrl}
          target="_blank"
          rel="noreferrer"
          className="about-status__support"
        >
          <Icon name="heart" />
          Поддержать проект
        </a>
      </section>
    </div>
  );
}
