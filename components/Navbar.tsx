'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Icon from './Icon';
import AuthUserButton from './AuthUserButton';
import MobileAccountNav from './MobileAccountNav';
import { useAuthState } from '@/components/AuthStateProvider';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';
import { BRAND_SLOGAN } from '@/lib/brand';

const SearchSuggestions = dynamic(
  () => import('./SearchSuggestions'),
  { ssr: false },
);

const SidebarMembership = dynamic(
  () => import('./SidebarMembership'),
  { ssr: false },
);

const SocialNotificationBadge = dynamic(
  () => import('./SocialNotificationBadge'),
  { ssr: false },
);

function SidebarMembershipFallback() {
  return (
    <Link
      href="/premium"
      className="sidebar-membership"
      aria-label="Открыть AnimeBox Premium"
    >
      <span className="sidebar-membership__icon" aria-hidden="true">
        <Icon name="crown" size={20} />
      </span>

      <span className="sidebar-membership__copy">
        <strong>AnimeBox Premium</strong>
        <small>Профиль · бонусы</small>
      </span>
    </Link>
  );
}

const mainNav = [
  {
    href: '/',
    label: 'Главная',
    icon: 'home' as const,
  },
  {
    href: '/search',
    label: 'Каталог',
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
  const [mobileNavHidden, setMobileNavHidden] = useState(false);
  const mobileNavScrollRef = useRef({
    lastY: 0,
    travel: 0,
    direction: null as 'up' | 'down' | null,
    directionSince: 0,
    raf: 0,
    hidden: false,
    lastToggleAt: 0,
  });

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
    const state = mobileNavScrollRef.current;
    state.lastY = window.scrollY;
    state.travel = 0;
    state.direction = null;
    state.directionSince = performance.now();
    state.hidden = false;
    state.lastToggleAt = 0;
    queueMicrotask(() => setMobileNavHidden(false));

    const setHidden = (hidden: boolean) => {
      if (state.hidden === hidden) return;
      state.hidden = hidden;
      state.lastToggleAt = performance.now();
      setMobileNavHidden(hidden);
    };

    const compactLandscapeQuery = window.matchMedia(
      '(orientation: landscape) and (max-height: 600px) and (max-width: 1100px)',
    );

    const navigationShouldStayVisible = () => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      const modalOpen = Boolean(
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [data-mobile-nav-lock="true"]',
        ),
      );

      return typing || modalOpen || compactLandscapeQuery.matches;
    };

    const update = () => {
      state.raf = 0;

      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - state.lastY;
      state.lastY = currentY;

      const now = performance.now();

      if (currentY < 96 || navigationShouldStayVisible()) {
        state.travel = 0;
        state.direction = null;
        state.directionSince = now;
        setHidden(false);
        return;
      }

      // Mobile browser chrome and touch inertia often emit tiny reverse deltas.
      // Ignore them so the nav does not flicker when the user slightly changes
      // finger direction or the viewport settles after a swipe.
      if (Math.abs(delta) < 5) return;

      const direction: 'up' | 'down' = delta > 0 ? 'down' : 'up';

      if (state.direction !== direction) {
        state.direction = direction;
        state.directionSince = now;
        state.travel = Math.abs(delta);
        return;
      }

      state.travel += Math.abs(delta);

      const directionStableFor = now - state.directionSince;
      const cooldownPassed = now - state.lastToggleAt >= 520;

      if (
        direction === 'down' &&
        !state.hidden &&
        state.travel >= 82 &&
        directionStableFor >= 90 &&
        cooldownPassed
      ) {
        setHidden(true);
        state.travel = 0;
        state.directionSince = now;
      } else if (
        direction === 'up' &&
        state.hidden &&
        state.travel >= 58 &&
        directionStableFor >= 110 &&
        cooldownPassed
      ) {
        setHidden(false);
        state.travel = 0;
        state.directionSince = now;
      }
    };

    const onScroll = () => {
      if (state.raf) return;
      state.raf = window.requestAnimationFrame(update);
    };

    const onFocusIn = () => {
      state.travel = 0;
      setHidden(false);
    };

    const onViewportChange = () => {
      state.lastY = Math.max(0, window.scrollY);
      state.travel = 0;
      state.direction = null;
      state.directionSince = performance.now();

      if (compactLandscapeQuery.matches) {
        setHidden(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    compactLandscapeQuery.addEventListener('change', onViewportChange);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onViewportChange);
      compactLandscapeQuery.removeEventListener('change', onViewportChange);
      document.removeEventListener('focusin', onFocusIn);
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = 0;
    };
  }, [pathname]);

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
                <span className="sidebar__icon" aria-hidden="true"><Icon name={item.icon} weight={active ? 'fill' : 'regular'} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__divider" />

        <div className="sidebar__label">Поддержка</div>

        <div className="sidebar__membership-block">
          {!authLoading && user ? (
            <SidebarMembership />
          ) : (
            <SidebarMembershipFallback />
          )}

          <Link
            href="/support"
            className={`sidebar__item sidebar__support ${
              isActive('/support') ? 'is-active' : ''
            }`}
            aria-current={isActive('/support') ? 'page' : undefined}
            title="Поддержать AnimeBox"
          >
            <span className="sidebar__icon" aria-hidden="true"><Icon name="heart" weight={isActive('/support') ? 'fill' : 'regular'} /></span>
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
            <span className="sidebar__icon" aria-hidden="true"><Icon name="telegram" /></span>
            <span>Telegram Mini App</span>
          </a>

          <Link
            href="/about"
            className={`sidebar__item sidebar__item--utility ${isActive('/about') ? 'is-active' : ''}`}
            aria-current={isActive('/about') ? 'page' : undefined}
            title="О проекте"
          >
            <span className="sidebar__icon" aria-hidden="true"><Icon name="info" weight={isActive('/about') ? 'fill' : 'regular'} /></span>
            <span>О проекте</span>
          </Link>

          <Link
            href="/copyright"
            className={`sidebar__item sidebar__item--utility ${isActive('/copyright') ? 'is-active' : ''}`}
            aria-current={isActive('/copyright') ? 'page' : undefined}
            title="Правообладателям"
          >
            <span className="sidebar__icon" aria-hidden="true"><Icon name="mail" weight={isActive('/copyright') ? 'fill' : 'regular'} /></span>
            <span>Правообладателям</span>
          </Link>
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
                <span className="sidebar__icon" aria-hidden="true"><Icon name="user" weight={isActive('/profile') ? 'fill' : 'regular'} /></span>
                <span>Профиль</span>
              </Link>

              <Link
                href="/friends"
                className={`sidebar__item sidebar__item--utility ${
                  isActive('/friends') ? 'is-active' : ''
                }`}
                title="Друзья"
              >
                <span className="sidebar__icon" aria-hidden="true"><Icon name="users" weight={isActive('/friends') ? 'fill' : 'regular'} /></span>
                <span>Друзья</span>
              </Link>

              <Link
                href="/settings"
                className={`sidebar__item sidebar__item--utility ${
                  isActive('/settings') ? 'is-active' : ''
                }`}
                title="Настройки"
              >
                <span className="sidebar__icon" aria-hidden="true"><Icon name="settings" weight={isActive('/settings') ? 'fill' : 'regular'} /></span>
                <span>Настройки</span>
              </Link>
            </nav>
          </div>
        )}
      </aside>

      {/* Topbar keeps only global actions: search, notifications, account. */}
      <header className="topbar">
        <form
          className="topbar__search"
          onSubmit={submitSearch}
          role="search"
          style={{ position: 'relative' }}
        >
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

          {searchValue.trim().length >= 2 && (
            <SearchSuggestions
              query={searchValue}
              onChoose={() => setSearchValue('')}
            />
          )}
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
      <nav
        className={`mobile-nav ${mobileNavHidden ? 'is-hidden' : ''}`}
        aria-label="Мобильная навигация"
      >
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
          <span>Каталог</span>
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
