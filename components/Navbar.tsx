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

const nav = [
  { href: '/', label: 'Главная', icon: 'home' as const },
  { href: '/search', label: 'Аниме', icon: 'anime' as const },
  { href: '/schedule', label: 'Расписание', icon: 'calendar' as const },
  { href: '/list', label: 'Трекер', icon: 'tracker' as const },
  { href: '/favorites', label: 'Избранное', icon: 'heart' as const },
];

const telegramUrl = 'https://t.me/yourAnimeBox';
const donateUrl = 'https://donatepay.ru/don/Armlet';

function NavbarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState('');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/search') {
      setSearchValue(searchParams.get('search') ?? '');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/search') {
      return;
    }

    const value = searchValue.trim();
    const currentValue = searchParams.get('search')?.trim() ?? '';

    if (value === currentValue) {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set('search', value);
      } else {
        params.delete('search');
      }

      const queryString = params.toString();

      router.replace(
        queryString ? `/search?${queryString}` : '/search',
        { scroll: false },
      );
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, router, searchParams, searchValue]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = searchValue.trim();

    if (pathname === '/search') {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set('search', value);
      } else {
        params.delete('search');
      }

      const queryString = params.toString();

      router.replace(
        queryString ? `/search?${queryString}` : '/search',
        { scroll: false },
      );

      return;
    }

    if (!value) {
      router.push('/search');
      return;
    }

    router.push(`/search?search=${encodeURIComponent(value)}`);
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <Link href="/" className="brand__link">
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
              <small>Смотри. Отслеживай. Живи.</small>
            </span>
          </Link>
        </div>

        <nav className="sidebar__nav">
          {nav.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={`sidebar__item ${isActive(item.href) ? 'is-active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar__divider" />
        <div className="sidebar__label">Полезное</div>

        <nav className="sidebar__nav sidebar__nav--muted">
          <Link href="/list" className="sidebar__item">
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
            className={`sidebar__item ${isActive('/about') ? 'is-active' : ''}`}
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
            Подключай уведомления о выходе любимого аниме.
          </span>

          <a href={telegramUrl} target="_blank" rel="noreferrer">
            Подключить
          </a>
        </div>
      </aside>

      <header className="topbar">
        <form className="topbar__search" onSubmit={submitSearch}>
          <Icon name="search" />

          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Поиск аниме"
            placeholder="Поиск аниме, например: One Piece..."
            autoComplete="off"
          />
        </form>

        <div className="topbar__actions">
          <Link href="/list" className="topbar__icon" aria-label="Уведомления">
            <Icon name="bell" />
          </Link>

          <Link href="/about" className="topbar__login">
            О проекте
          </Link>

          <Link href="/list" className="topbar__register">
            Регистрация
          </Link>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <Link href="/" className={`mobile-nav__item ${isActive('/') ? 'is-active' : ''}`}>
          <Icon name="home" />
          <span>Главная</span>
        </Link>

        <Link href="/search" className={`mobile-nav__item ${isActive('/search') ? 'is-active' : ''}`}>
          <Icon name="anime" />
          <span>Аниме</span>
        </Link>

        <Link href="/schedule" className={`mobile-nav__item ${isActive('/schedule') ? 'is-active' : ''}`}>
          <Icon name="calendar" />
          <span>Расписание</span>
        </Link>

        <Link href="/list" className={`mobile-nav__item ${isActive('/list') ? 'is-active' : ''}`}>
          <Icon name="tracker" />
          <span>Трекер</span>
        </Link>

        <button
          type="button"
          className={`mobile-nav__item ${mobileMoreOpen || isActive('/favorites') || isActive('/about') ? 'is-active' : ''}`}
          onClick={() => setMobileMoreOpen((value) => !value)}
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-more-menu"
        >
          <Icon name="menu" />
          <span>Ещё</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <>
          <button
            type="button"
            className="mobile-more__backdrop"
            aria-label="Закрыть меню"
            onClick={() => setMobileMoreOpen(false)}
          />

          <div id="mobile-more-menu" className="mobile-more" role="dialog" aria-label="Дополнительная навигация">
            <div className="mobile-more__handle" />
            <div className="mobile-more__head">
              <strong>AnimeBox</strong>
              <button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>

            <div className="mobile-more__grid">
              <Link href="/favorites" className="mobile-more__item">
                <Icon name="heart" />
                <span>Избранное</span>
              </Link>

              <Link href="/list" className="mobile-more__item">
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

              <Link href="/about" className="mobile-more__item">
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

function NavbarFallback() {
  return (
    <>
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          <Link href="/" className="brand__link">
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
              <small>Смотри. Отслеживай. Живи.</small>
            </span>
          </Link>
        </div>
      </aside>

      <header className="topbar" aria-hidden="true">
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
    <Suspense fallback={<NavbarFallback />}>
      <NavbarContent />
    </Suspense>
  );
}
