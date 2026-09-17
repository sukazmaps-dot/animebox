import Link from 'next/link';
import Icon from '@/components/Icon';
import {
  TELEGRAM_BOT_HANDLE,
  TELEGRAM_MINI_APP_URL,
} from '@/lib/telegram-links';

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
    title: 'Telegram Mini App',
    description:
      `Mini App уже работает вместе с веб-версией AnimeBox: один аккаунт, синхронизация и уведомления о новых сериях через ${TELEGRAM_BOT_HANDLE}.`,
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
          каждую серию отдельно. Веб-версия и Telegram Mini App работают как
          единый сервис, а бот присылает уведомления о новых сериях подписанных
          тайтлов.
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
            href={TELEGRAM_MINI_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn--ghost"
          >
            <Icon name="telegram" />
            Открыть Mini App
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
          Сейчас основная работа сосредоточена на качестве AnimeBox:
          интерфейсе, стабильности источников данных, трекере, профилях,
          сообществе и дальнейшем улучшении Telegram-интеграции. Mini App и
          уведомления уже работают. Если найдёшь баг или хочешь предложить
          идею, открой {TELEGRAM_BOT_HANDLE}.
        </p>

        <Link
          href="/support"
          className="about-status__support"
        >
          <Icon name="heart" />
          Поддержать проект
        </Link>
      </section>
    </div>
  );
}
