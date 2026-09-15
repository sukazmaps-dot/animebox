'use client';

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  
  // Выводим в консоль браузера текущий путь для проверки
  console.log('Current Pathname:', pathname);

  // Проверяем все возможные варианты путей для страницы каталога/поиска
  const isSearchPage = 
    pathname === '/search' || 
    pathname === '/anime' || 
    pathname?.startsWith('/search') || 
    pathname?.startsWith('/anime');

  return (
    <header className="site-header">
      <div className="header-container">
        {/* Логотип */}
        <Link href="/" className="brand">
          <div className="brand-logo">
            <Image
              src="/logo.png"
              alt="AnimeTracker"
              width={42}
              height={42}
              priority
            />
          </div>

          <div className="brand-text">
            <span className="brand-title">ANIMETRACKER</span>
            <span className="brand-subtitle">
              Смотри. Отслеживай. Живи.
            </span>
          </div>
        </Link>

        {/* Поиск в шапке (скрывается, если это страница поиска или аниме) */}
        {!isSearchPage && (
          <div className="header-search">
            <svg
              className="search-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16.5 16.5L21 21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            <input
              type="text"
              placeholder="Поиск аниме, например: One Piece..."
            />
          </div>
        )}

        {/* Навигация */}
        <nav className="header-nav">
          <Link href="/" className="header-link">
            Главная
          </Link>

          <Link href="/search" className="header-link">
            Аниме
          </Link>

          <Link href="/schedule" className="header-link">
            Расписание
          </Link>

          <Link href="/list" className="header-link">
            Мой список
          </Link>
        </nav>

        {/* Уведомления */}
        <button
          className="header-icon-button"
          type="button"
          aria-label="Уведомления"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 21h4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Профиль */}
        <button
          className="profile-button"
          type="button"
          aria-label="Профиль"
        >
          <div className="profile-avatar">
            <span>G</span>
          </div>
        </button>
      </div>
    </header>
  );
}