import type { Metadata } from 'next';
import Link from 'next/link';

import Icon from '@/components/Icon';
import { BRAND_SLOGAN } from '@/lib/brand';
import {
  COPYRIGHT_EMAIL,
  SUPPORT_EMAIL,
  buildSupportMailto,
} from '@/lib/contact';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';
import {
  TELEGRAM_BOT_HANDLE,
  TELEGRAM_MINI_APP_URL,
} from '@/lib/telegram-links';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'О проекте',
  description:
    'AnimeBox — аниме-платформа с каталогом, трекером, профилями, достижениями, Watch Together, сообществом и Telegram Mini App.',
  path: '/about',
});

const features = [
  {
    icon: 'anime' as const,
    title: 'Каталог и поиск',
    description:
      'Большой каталог аниме с поиском, жанрами, статусами, сезонами, франшизами, расписанием и подборками для быстрого поиска следующего тайтла.',
  },
  {
    icon: 'tracker' as const,
    title: 'Трекер и прогресс',
    description:
      'Статусы просмотра, сохранённый прогресс по сериям, продолжение с нужного эпизода и личная библиотека, которая остаётся синхронизированной с аккаунтом.',
  },
  {
    icon: 'users' as const,
    title: 'Watch Together',
    description:
      'Совместные просмотры с друзьями и публичными комнатами. AnimeBox развивает синхронизацию просмотра, участников, чат и мобильный сценарий.',
  },
  {
    icon: 'chat' as const,
    title: 'Сообщество и друзья',
    description:
      'Комментарии к сериям, общий чат, друзья, уведомления и социальные механики, чтобы AnimeBox был не просто каталогом, а живым аниме-сообществом.',
  },
  {
    icon: 'trophy' as const,
    title: 'Профили и прогрессия',
    description:
      'Профили с аватаром и баннером, статистика просмотра, достижения, серии активности, лидерборд, Premium-оформление и персональные элементы профиля.',
  },
  {
    icon: 'telegram' as const,
    title: 'Telegram-экосистема',
    description:
      'Веб-версия, Telegram Mini App и ' +
      TELEGRAM_BOT_HANDLE +
      ' работают как единая система: аккаунт, уведомления о новых сериях и быстрый доступ к AnimeBox.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page about-page--current">
      <section className="about-hero">
        <span className="about-hero__eyebrow">ANIMEBOX · PUBLIC BETA</span>

        <h1>{BRAND_SLOGAN}</h1>

        <p>
          AnimeBox — развивающаяся аниме-платформа, которая объединяет каталог,
          личный трекер, профили, достижения, друзей, обсуждения и совместные
          просмотры. Мы хотим, чтобы поиск следующего тайтла, просмотр серий и
          общение вокруг аниме происходили в одном понятном месте — на сайте и
          в Telegram Mini App.
        </p>

        <div className="about-hero__actions">
          <Link href="/search" className="btn btn--primary">
            Открыть каталог
          </Link>

          <Link href="/watch-together" className="btn btn--ghost">
            <Icon name="users" />
            Watch Together
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
          AnimeBox активно развивается. Сейчас приоритет — качество мобильного
          интерфейса, стабильность источников просмотра, Watch Together,
          каталог и рекомендации, профили, социальные функции, производительность
          и подготовка платформы к международной аудитории. Если найдёшь баг или
          хочешь предложить идею, напиши на {SUPPORT_EMAIL} или открой{' '}
          {TELEGRAM_BOT_HANDLE}.
        </p>

        <a
          href={buildSupportMailto('Поддержка AnimeBox')}
          className="about-status__support"
        >
          <Icon name="mail" />
          Написать в поддержку
        </a>

        <Link href="/support" className="about-status__support">
          <Icon name="heart" />
          Поддержать проект
        </Link>
      </section>

      <section className="about-status about-status--current">
        <div>
          <span>Права и обращения</span>
          <strong>Для правообладателей</strong>
        </div>

        <p>
          Для обращений по конкретным материалам у AnimeBox есть отдельный
          Rights Holder Center. Там можно указать произведение, точные URL,
          основание обращения и контактные данные. Каждое обращение получает
          номер дела и может быть обработано через отдельную административную
          систему ограничений.
        </p>

        <Link href="/copyright" className="about-status__support">
          <Icon name="info" />
          Открыть раздел «Правообладателям»
        </Link>

        <a
          href={'mailto:' + COPYRIGHT_EMAIL}
          className="about-status__support"
        >
          <Icon name="mail" />
          {COPYRIGHT_EMAIL}
        </a>
      </section>
    </div>
  );
}
