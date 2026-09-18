'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Icon from './Icon';
import AuthUserButton from './AuthUserButton';
import MobileAccountNav from './MobileAccountNav';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';
import { buildSupportMailto } from '@/lib/contact';

const mainNav = [
  {
    href: '/',
    label: 'Главная',
    icon: 'home' as const,
  },
  {
    href: '/search',
    label: 'Аниме',
    icon: 'anime' as const,
  },
  {
    href: '/schedule',
    label: 'Расписание',
    icon: 'calendar' as const,
  },
  {
    href: '/list',
    label: 'Трекер',
    icon: 'tracker' as const,
  },
  {
    href: '/favorites',
    label: 'Избранное',
    icon: 'heart' as const,
  },
  {
    href: '/leaderboard',
    label: 'Рейтинг',
    icon: 'trophy' as const,
  },
];

const telegramUrl = TELEGRAM_MINI_APP_URL;

function NavbarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState('');

  /*
   * Если пользователь находится на странице поиска,
   * синхронизируем поле с ?search=
   */
  useEffect(() => {
    if (pathname === '/search') {
      // URL query is external navigation state; mirror it into the controlled input.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchValue(
        searchParams.get('search') ?? '',
      );
    }
  }, [pathname, searchParams]);

  /*
   * На /search обновляем URL автоматически,
   * но с debounce, чтобы не делать переход
   * после каждого символа моментально.
   */
  useEffect(() => {
    if (pathname !== '/search') {
      return;
    }

    const value = searchValue.trim();

    const currentValue =
      searchParams.get('search')?.trim() ?? '';

    if (value === currentValue) {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(
        searchParams.toString(),
      );

      if (value) {
        params.set('search', value);
      } else {
        params.delete('search');
      }

      const queryString = params.toString();

      router.replace(
        queryString
          ? `/search?${queryString}`
          : '/search',
        {
          scroll: false,
        },
      );
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    pathname,
    router,
    searchParams,
    searchValue,
  ]);

  function submitSearch(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value = searchValue.trim();

    /*
     * Если мы уже на /search,
     * просто обновляем параметры URL.
     */
    if (pathname === '/search') {
      const params = new URLSearchParams(
        searchParams.toString(),
      );

      if (value) {
        params.set('search', value);
      } else {
        params.delete('search');
      }

      const queryString = params.toString();

      router.replace(
        queryString
          ? `/search?${queryString}`
          : '/search',
        {
          scroll: false,
        },
      );

      return;
    }

    /*
     * Пустой запрос просто открывает каталог.
     */
    if (!value) {
      router.push('/search');
      return;
    }

    router.push(
      `/search?search=${encodeURIComponent(
        value,
      )}`,
    );
  }

  function isActive(href: string) {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname.startsWith(href);
  }



  return (
    <>
      {/* =========================
          DESKTOP SIDEBAR
          ========================= */}

      <aside className="sidebar">
        <div className="brand">
          <Link
            href="/"
            className="brand__link"
            aria-label="AnimeBox — главная"
          >
            <span className="brand__mark">
              <Image
                src="/logo.png"
                alt="AnimeBox"
                width={34}
                height={34}
                priority
              />
            </span>

            <span>
              <strong>ANIMEBOX</strong>

              <small>
                Смотри. Отслеживай. Живи.
              </small>
            </span>
          </Link>
        </div>

        <nav
          className="sidebar__nav"
          aria-label="Основная навигация"
        >
          {mainNav.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar__item ${
                  active ? 'is-active' : ''
                }`}
                aria-current={
                  active ? 'page' : undefined
                }
              >
                <Icon name={item.icon} />

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__divider" />

        <div className="sidebar__label">
          Сервис
        </div>

        <nav className="sidebar__nav sidebar__nav--muted">
          <Link
            href="/notifications"
            className={`sidebar__item sidebar__item--utility ${isActive('/notifications') ? 'is-active' : ''}`}
          >
            <img
              className="topbar__asset-icon topbar__asset-icon--notification"
              src="/brand/icons/notification.svg"
              alt=""
              aria-hidden="true"
            />
            <span>Уведомления</span>
          </Link>

          <a
            href={telegramUrl}
            className="sidebar__item sidebar__item--utility sidebar__item--external"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="telegram" />
            <span>Telegram Mini App</span>
          </a>

          <a
            href={buildSupportMailto('Поддержка AnimeBox')}
            className="sidebar__item sidebar__item--utility"
          >
            <Icon name="mail" />
            <span>Написать в поддержку</span>
          </a>

          <Link
            href="/about"
            className={`sidebar__item sidebar__item--utility ${
              isActive('/about')
                ? 'is-active'
                : ''
            }`}
            aria-current={
              isActive('/about')
                ? 'page'
                : undefined
            }
          >
            <Icon name="info" />
            <span>О проекте</span>
          </Link>

          <Link
            href="/premium"
            className={`sidebar__item sidebar__item--premium ${isActive('/premium') ? 'is-active' : ''}`}
          >
            <Icon name="star" />
            <span>AnimeBox Premium</span>
          </Link>

          <Link
            href="/support"
            className={`sidebar__item sidebar__item--utility ${isActive('/support') ? 'is-active' : ''}`}
          >
            <Icon name="heart" />
            <span>Поддержать проект</span>
          </Link>
        </nav>

      </aside>

      {/* =========================
          TOPBAR
          ========================= */}

      <header className="topbar">
        <form
          className="topbar__search"
          onSubmit={submitSearch}
          role="search"
        >
          <img
            className="topbar__asset-icon topbar__asset-icon--search"
            src="/brand/icons/search.svg"
            alt=""
            aria-hidden="true"
          />

          <input
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value,
              )
            }
            aria-label="Поиск аниме"
            placeholder="Поиск аниме, например: One Piece..."
            autoComplete="off"
          />
        </form>

        <div className="topbar__actions">
          <Link
            href="/notifications"
            className="topbar__icon"
            aria-label="Уведомления"
          >
            <Icon name="bell" />
          </Link>

          <Link
            href="/about"
            className="topbar__login"
          >
            О проекте
          </Link>

          <AuthUserButton />
        </div>
      </header>

      {/* =========================
          MOBILE NAVIGATION
          ========================= */}

      <nav
        className="mobile-nav"
        aria-label="Мобильная навигация"
      >
        <Link
          href="/"
          className={`mobile-nav__item ${
            isActive('/') ? 'is-active' : ''
          }`}
          aria-current={isActive('/') ? 'page' : undefined}
        >
          <Icon name="home" />
          <span>Главная</span>
        </Link>

        <Link
          href="/search"
          className={`mobile-nav__item ${
            isActive('/search') ? 'is-active' : ''
          }`}
          aria-current={isActive('/search') ? 'page' : undefined}
        >
          <Icon name="anime" />
          <span>Аниме</span>
        </Link>

        <Link
          href="/list"
          className={`mobile-nav__item ${
            isActive('/list') ? 'is-active' : ''
          }`}
          aria-current={isActive('/list') ? 'page' : undefined}
        >
          <Icon name="tracker" />
          <span>Трекер</span>
        </Link>

        <MobileAccountNav pathname={pathname} />
      </nav>
    </>
  );
}

/* =========================
   SUSPENSE FALLBACK
   ========================= */

function NavbarFallback() {
  return (
    <>
      <aside
        className="sidebar"
        aria-hidden="true"
      >
        <div className="brand">
          <Link
            href="/"
            className="brand__link"
          >
            <span className="brand__mark">
              <Image
                src="/logo.png"
                alt="AnimeBox"
                width={34}
                height={34}
                priority
              />
            </span>

            <span>
              <strong>ANIMEBOX</strong>

              <small>
                Смотри. Отслеживай. Живи.
              </small>
            </span>
          </Link>
        </div>
      </aside>

      <header
        className="topbar"
        aria-hidden="true"
      >
        <div className="topbar__search">
          <img
            className="topbar__asset-icon topbar__asset-icon--search"
            src="/brand/icons/search.svg"
            alt=""
            aria-hidden="true"
          />

          <input
            value=""
            readOnly
            tabIndex={-1}
            placeholder="Поиск аниме, например: One Piece..."
          />
        </div>
      </header>
    </>
  );
}

export default function Navbar() {
  return (
    <Suspense
      fallback={<NavbarFallback />}
    >
      <NavbarContent />
    </Suspense>
  );
}