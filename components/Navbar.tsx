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
import SidebarMembership from './SidebarMembership';
import { useAuthState } from '@/components/AuthStateProvider';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

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
    href: '/watch-together',
    label: 'Watch Together',
    icon: 'users' as const,
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
  const { user, loading: authLoading } = useAuthState();

  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (pathname === '/search') {
      // URL query is external navigation state; mirror it into the controlled input.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchValue(searchParams.get('search') ?? '');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname !== '/search') return;

    const value = searchValue.trim();
    const currentValue = searchParams.get('search')?.trim() ?? '';

    if (value === currentValue) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) params.set('search', value);
      else params.delete('search');

      const queryString = params.toString();

      router.replace(queryString ? `/search?${queryString}` : '/search', {
        scroll: false,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pathname, router, searchParams, searchValue]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = searchValue.trim();

    if (pathname === '/search') {
      const params = new URLSearchParams(searchParams.toString());

      if (value) params.set('search', value);
      else params.delete('search');

      const queryString = params.toString();

      router.replace(queryString ? `/search?${queryString}` : '/search', {
        scroll: false,
      });
      return;
    }

    if (!value) {
      router.push('/search');
      return;
    }

    router.push(`/search?search=${encodeURIComponent(value)}`);
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop / tablet sidebar. On phones it is replaced by mobile-nav. */}
      <aside className="sidebar">
        <div className="brand">
          <Link href="/" className="brand__link" aria-label="AnimeBox — главная">
            <span className="brand__mark">
              <Image
                src="/logo.png"
                alt="AnimeBox"
                width={34}
                height={34}
                priority
              />
            </span>

            <span className="brand__copy">
              <strong>ANIMEBOX</strong>
              <small>Смотри. Отслеживай. Живи.</small>
            </span>
          </Link>
        </div>

        <nav className="sidebar__nav" aria-label="Основная навигация">
          {mainNav.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar__item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__divider" />

        <div className="sidebar__label">Поддержка</div>

        <div className="sidebar__membership-block">
          <SidebarMembership />

          <Link
            href="/support"
            className={`sidebar__item sidebar__support ${
              isActive('/support') ? 'is-active' : ''
            }`}
            aria-current={isActive('/support') ? 'page' : undefined}
            title="Поддержать AnimeBox"
          >
            <Icon name="heart" />
            <span>
              <strong>Поддержать AnimeBox</strong>
              <small>Stars, Boosty и другие способы</small>
            </span>
          </Link>
        </div>

        <div className="sidebar__divider sidebar__divider--service" />

        <nav className="sidebar__nav sidebar__nav--muted" aria-label="Сервисы">
          <a
            href={telegramUrl}
            className="sidebar__item sidebar__item--utility sidebar__item--external"
            target="_blank"
            rel="noreferrer"
            title="Telegram Mini App"
          >
            <Icon name="telegram" />
            <span>Telegram Mini App</span>
          </a>
        </nav>

        {!authLoading && user && (
          <div className="sidebar__account">
            <div className="sidebar__label">Аккаунт</div>

            <nav className="sidebar__nav sidebar__nav--muted" aria-label="Аккаунт">
              <Link
                href="/profile"
                className={`sidebar__item sidebar__item--utility ${
                  isActive('/profile') ? 'is-active' : ''
                }`}
                title="Профиль"
              >
                <Icon name="user" />
                <span>Профиль</span>
              </Link>

              <Link
                href="/settings"
                className={`sidebar__item sidebar__item--utility ${
                  isActive('/settings') ? 'is-active' : ''
                }`}
                title="Настройки"
              >
                <Icon name="menu" />
                <span>Настройки</span>
              </Link>
            </nav>
          </div>
        )}
      </aside>

      {/* Topbar keeps only global actions: search, notifications, account. */}
      <header className="topbar">
        <form className="topbar__search" onSubmit={submitSearch} role="search">
          <img
            className="topbar__asset-icon topbar__asset-icon--search"
            src="/brand/icons/search.svg"
            alt=""
            aria-hidden="true"
          />

          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Поиск аниме"
            placeholder="Умный поиск: Наруто 2 сезон, One Piece..."
            autoComplete="off"
          />
        </form>

        <div className="topbar__actions">
          {!authLoading && user && (
            <Link
              href="/notifications"
              className="topbar__icon"
              aria-label="Уведомления"
            >
              <Icon name="bell" />
            </Link>
          )}

          <AuthUserButton />
        </div>
      </header>

      {/* Phone navigation stays compact. */}
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <Link
          href="/"
          className={`mobile-nav__item ${isActive('/') ? 'is-active' : ''}`}
          aria-current={isActive('/') ? 'page' : undefined}
        >
          <Icon name="home" />
          <span>Главная</span>
        </Link>

        <Link
          href="/search"
          className={`mobile-nav__item ${isActive('/search') ? 'is-active' : ''}`}
          aria-current={isActive('/search') ? 'page' : undefined}
        >
          <Icon name="anime" />
          <span>Аниме</span>
        </Link>

        <Link
          href="/list"
          className={`mobile-nav__item ${isActive('/list') ? 'is-active' : ''}`}
          aria-current={isActive('/list') ? 'page' : undefined}
        >
          <Icon name="tracker" />
          <span>Трекер</span>
        </Link>

        <Link
          href="/watch-together"
          className={`mobile-nav__item ${isActive('/watch-together') ? 'is-active' : ''}`}
          aria-current={isActive('/watch-together') ? 'page' : undefined}
        >
          <Icon name="users" />
          <span>Вместе</span>
        </Link>

        <MobileAccountNav pathname={pathname} />
      </nav>
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

            <span className="brand__copy">
              <strong>ANIMEBOX</strong>
              <small>Смотри. Отслеживай. Живи.</small>
            </span>
          </Link>
        </div>
      </aside>

      <header className="topbar" aria-hidden="true">
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
            placeholder="Умный поиск: Наруто 2 сезон, One Piece..."
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
