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
];

const telegramUrl = 'https://t.me/yourAnimeBox';
const donateUrl = 'https://donatepay.ru/don/Armlet';

function NavbarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState('');
  const [mobileMoreOpen, setMobileMoreOpen] =
    useState(false);

  /*
   * Если пользователь находится на странице поиска,
   * синхронизируем поле с ?search=
   */
  useEffect(() => {
    if (pathname === '/search') {
      setSearchValue(
        searchParams.get('search') ?? '',
      );
    }
  }, [pathname, searchParams]);

  /*
   * При переходе на другую страницу
   * мобильное меню автоматически закрывается.
   */
  useEffect(() => {
    setMobileMoreOpen(false);
  }, [pathname]);

  /*
   * Escape закрывает мобильное меню.
   */
  useEffect(() => {
    if (!mobileMoreOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMoreOpen(false);
      }
    }

    window.addEventListener(
      'keydown',
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleEscape,
      );
    };
  }, [mobileMoreOpen]);

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

  /*
   * Эти страницы находятся внутри
   * мобильного раздела "Ещё".
   */
  const mobileMoreActive =
    mobileMoreOpen ||
    isActive('/profile') ||
    isActive('/favorites') ||
    isActive('/about');

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
          Полезное
        </div>

        <nav className="sidebar__nav sidebar__nav--muted">
          <Link
            href="/list"
            className="sidebar__item"
          >
            <Icon name="bell" />
            <span>Уведомления</span>
          </Link>

          <a
            href={telegramUrl}
            className="sidebar__item"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="telegram" />
            <span>Telegram Mini App</span>
          </a>

          <Link
            href="/about"
            className={`sidebar__item ${
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

          <a
            href={donateUrl}
            className="sidebar__item"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="heart" />
            <span>Поддержать проект</span>
          </a>
        </nav>

        <div className="sidebar__promo">
          <div className="sidebar__promo-icon">
            <Icon name="telegram" />
          </div>

          <strong>
            Получай уведомления
            <br />
            о новых сериях в Telegram
          </strong>

          <span>
            Подключай уведомления о выходе
            любимого аниме.
          </span>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
          >
            Подключить
          </a>
        </div>
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
          <Icon name="search" />

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
            href="/list"
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
          aria-current={
            isActive('/')
              ? 'page'
              : undefined
          }
        >
          <Icon name="home" />
          <span>Главная</span>
        </Link>

        <Link
          href="/search"
          className={`mobile-nav__item ${
            isActive('/search')
              ? 'is-active'
              : ''
          }`}
          aria-current={
            isActive('/search')
              ? 'page'
              : undefined
          }
        >
          <Icon name="anime" />
          <span>Аниме</span>
        </Link>

        <Link
          href="/schedule"
          className={`mobile-nav__item ${
            isActive('/schedule')
              ? 'is-active'
              : ''
          }`}
          aria-current={
            isActive('/schedule')
              ? 'page'
              : undefined
          }
        >
          <Icon name="calendar" />
          <span>Расписание</span>
        </Link>

        <Link
          href="/list"
          className={`mobile-nav__item ${
            isActive('/list')
              ? 'is-active'
              : ''
          }`}
          aria-current={
            isActive('/list')
              ? 'page'
              : undefined
          }
        >
          <Icon name="tracker" />
          <span>Трекер</span>
        </Link>

        <button
          type="button"
          className={`mobile-nav__item ${
            mobileMoreActive
              ? 'is-active'
              : ''
          }`}
          onClick={() =>
            setMobileMoreOpen(
              (value) => !value,
            )
          }
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-more-menu"
        >
          <Icon name="menu" />
          <span>Ещё</span>
        </button>
      </nav>

      {/* =========================
          MOBILE MORE
          ========================= */}

      {mobileMoreOpen && (
        <>
          <button
            type="button"
            className="mobile-more__backdrop"
            aria-label="Закрыть меню"
            onClick={() =>
              setMobileMoreOpen(false)
            }
          />

          <div
            id="mobile-more-menu"
            className="mobile-more"
            role="dialog"
            aria-modal="true"
            aria-label="Дополнительная навигация"
          >
            <div className="mobile-more__handle" />

            <div className="mobile-more__head">
              <strong>AnimeBox</strong>

              <button
                type="button"
                onClick={() =>
                  setMobileMoreOpen(false)
                }
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="mobile-more__grid">
              {/* Профиль теперь доступен и на телефоне */}

              <Link
                href="/profile"
                className="mobile-more__item"
              >
                <Icon name="tracker" />
                <span>Профиль</span>
              </Link>

              <Link
                href="/favorites"
                className="mobile-more__item"
              >
                <Icon name="heart" />
                <span>Избранное</span>
              </Link>

              <Link
                href="/list"
                className="mobile-more__item"
              >
                <Icon name="bell" />
                <span>Уведомления</span>
              </Link>

              <a
                href={telegramUrl}
                className="mobile-more__item"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="telegram" />
                <span>Telegram</span>
              </a>

              <Link
                href="/about"
                className="mobile-more__item"
              >
                <Icon name="info" />
                <span>О проекте</span>
              </Link>

              <a
                href={donateUrl}
                className="mobile-more__item mobile-more__item--support"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="heart" />
                <span>Поддержать</span>
              </a>
            </div>
          </div>
        </>
      )}
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
          <Icon name="search" />

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