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
import SocialNotificationBadge from './SocialNotificationBadge';
import SidebarMembership from './SidebarMembership';
import { useAuthState } from '@/components/AuthStateProvider';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';
import { BRAND_SLOGAN } from '@/lib/brand';

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
    href: '/chat',
    label: 'Чат',
    icon: 'chat' as const,
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

  const [searchValue, setSearchValue] = useState(() => (
    pathname === '/search' ? searchParams.get('search') ?? '' : ''
  ));

  function emitLiveSearch(value: string) {
    window.dispatchEvent(new CustomEvent('animebox-search-input', {
      detail: { query: value },
    }));
  }

  function syncSearchFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('search') ?? '';
    setSearchValue(value);
    emitLiveSearch(value);
  }

  useEffect(() => {
    if (pathname !== '/search') return;
    // Read from the browser URL only when entering the page. We intentionally
    // do not mirror every useSearchParams update back into the input: doing so
    // could overwrite fresh keystrokes with an older navigation result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncSearchFromLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname === '/search') syncSearchFromLocation();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSearchInput = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: unknown }>).detail;
      if (typeof detail?.query !== 'string') return;
      setSearchValue(detail.query);
    };
    window.addEventListener('animebox-search-input', onSearchInput);
    return () => window.removeEventListener('animebox-search-input', onSearchInput);
  }, []);

  useEffect(() => {
    if (pathname !== '/search') return;

    const value = searchValue.trim();
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const currentValue = url.searchParams.get('search')?.trim() ?? '';
      if (value === currentValue) return;

      if (value) url.searchParams.set('search', value);
      else url.searchParams.delete('search');

      // Native history keeps the address shareable without starting a full
      // App Router navigation (and therefore without rerunning the server page)
      // on every keystroke. Next.js integrates these history updates with
      // useSearchParams.
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    }, 140);

    return () => window.clearTimeout(timer);
  }, [pathname, searchValue]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = searchValue.trim();

    if (pathname === '/search') {
      const url = new URL(window.location.href);
      if (value) url.searchParams.set('search', value);
      else url.searchParams.delete('search');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
      emitLiveSearch(value);
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
              <small>{BRAND_SLOGAN}</small>
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
                href="/friends"
                className={`sidebar__item sidebar__item--utility ${
                  isActive('/friends') ? 'is-active' : ''
                }`}
                title="Друзья"
              >
                <Icon name="users" />
                <span>Друзья</span>
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
            onChange={(event) => {
              const value = event.target.value;
              setSearchValue(value);
              if (pathname === '/search') emitLiveSearch(value);
            }}
            aria-label="Поиск аниме"
            placeholder="Умный поиск: Наруто 2 сезон, One Piece..."
            autoComplete="off"
          />
        </form>

        <div className="topbar__actions">
          {!authLoading && user && (
            <Link
              href="/notifications"
              className="topbar__icon relative"
              aria-label="Уведомления"
            >
              <Icon name="bell" />
              <SocialNotificationBadge />
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
              <small>{BRAND_SLOGAN}</small>
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
