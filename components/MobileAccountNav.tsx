'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { useAuthState } from '@/components/AuthStateProvider';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

type Props = {
  pathname: string;
};

const telegramUrl = TELEGRAM_MINI_APP_URL;
const donateUrl = 'https://donatepay.ru/don/Armlet';

export default function MobileAccountNav({ pathname }: Props) {
  const {
    profile,
    loading,
    signOut,
    telegramMiniApp,
    telegramAutoLoginDisabled,
    resumeTelegramAutoLogin,
  } = useAuthState();
  const [open, setOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const username = profile?.username?.trim() || 'Пользователь';

  const avatarUrl = profile?.avatar_path
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(profile.avatar_path).data.publicUrl
    : '/default-avatar.webp';

  const accountSectionActive =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/favorites') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/leaderboard');

  async function logout() {
    setOpen(false);
    await signOut();
    window.location.replace('/');
  }

  return (
    <>
      <button
        type="button"
        className={`mobile-nav__item mobile-nav__profile ${
          accountSectionActive || open ? 'is-active' : ''
        }`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="mobile-account-sheet"
        aria-label={profile ? `Профиль ${username}` : 'Аккаунт'}
      >
        <span className={`mobile-nav__avatar ${loading ? 'is-loading' : ''}`}>
          {profile ? <img src={avatarUrl} alt="" /> : <Icon name="user" />}
        </span>
        <span>Профиль</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="mobile-account__backdrop"
            aria-label="Закрыть меню аккаунта"
            onClick={() => setOpen(false)}
          />

          <section
            id="mobile-account-sheet"
            className="mobile-account"
            role="dialog"
            aria-modal="true"
            aria-label="Меню аккаунта AnimeBox"
          >
            <div className="mobile-account__handle" />

            <div className="mobile-account__identity">
              <span className="mobile-account__avatar">
                {profile ? (
                  <img src={avatarUrl} alt={`Аватар ${username}`} />
                ) : (
                  <Icon name="user" />
                )}
              </span>

              <div className="mobile-account__identity-copy">
                <strong>{profile ? username : 'AnimeBox аккаунт'}</strong>
                <span>
                  {profile
                    ? 'Профиль, коллекция и настройки'
                    : telegramMiniApp && telegramAutoLoginDisabled
                      ? 'Автовход через Telegram выключен'
                      : telegramMiniApp
                        ? 'Войди через Telegram или другим способом'
                        : 'Войди, чтобы синхронизировать прогресс'}
                </span>
              </div>

              <button
                type="button"
                className="mobile-account__close"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            {!profile && (
              <div className="mobile-account__auth-actions">
                {telegramMiniApp ? (
                  <>
                    <button
                      type="button"
                      className="mobile-account__auth-button mobile-account__auth-button--primary"
                      onClick={() => {
                        setOpen(false);
                        resumeTelegramAutoLogin();
                      }}
                    >
                      Войти через Telegram
                    </button>

                    <Link
                      href="/login"
                      className="mobile-account__auth-button"
                      onClick={() => setOpen(false)}
                    >
                      Другой способ
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="mobile-account__auth-button"
                      onClick={() => setOpen(false)}
                    >
                      Войти
                    </Link>
                    <Link
                      href="/register"
                      className="mobile-account__auth-button mobile-account__auth-button--primary"
                      onClick={() => setOpen(false)}
                    >
                      Регистрация
                    </Link>
                  </>
                )}
              </div>
            )}

            <nav className="mobile-account__links" aria-label="Меню профиля">
              {profile && (
                <Link
                  href="/profile"
                  className="mobile-account__link"
                  onClick={() => setOpen(false)}
                >
                  <Icon name="user" />
                  <span>
                    <strong>Мой профиль</strong>
                    <small>Аватар, баннер и описание</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
              )}

              <Link
                href="/favorites"
                className="mobile-account__link"
                onClick={() => setOpen(false)}
              >
                <Icon name="heart" />
                <span>
                  <strong>Избранное</strong>
                  <small>Сохранённые тайтлы</small>
                </span>
                <Icon name="chevron" />
              </Link>

              <Link
                href="/schedule"
                className="mobile-account__link"
                onClick={() => setOpen(false)}
              >
                <Icon name="calendar" />
                <span>
                  <strong>Расписание</strong>
                  <small>Ближайшие новые серии</small>
                </span>
                <Icon name="chevron" />
              </Link>

              <Link
                href="/notifications"
                className="mobile-account__link"
                onClick={() => setOpen(false)}
              >
                <Icon name="bell" />
                <span>
                  <strong>Уведомления</strong>
                  <small>Новые серии в Telegram</small>
                </span>
                <Icon name="chevron" />
              </Link>

              <Link
                href="/leaderboard"
                className="mobile-account__link"
                onClick={() => setOpen(false)}
              >
                <Icon name="trophy" />
                <span>
                  <strong>Лидерборд</strong>
                  <small>Топ-100 по времени просмотра</small>
                </span>
                <Icon name="chevron" />
              </Link>

              <a
                href={telegramUrl}
                className="mobile-account__link"
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <Icon name="telegram" />
                <span>
                  <strong>Telegram</strong>
                  <small>Уведомления и Mini App</small>
                </span>
                <Icon name="chevron" />
              </a>

              <Link
                href="/about"
                className="mobile-account__link"
                onClick={() => setOpen(false)}
              >
                <Icon name="info" />
                <span>
                  <strong>О проекте</strong>
                  <small>Что такое AnimeBox</small>
                </span>
                <Icon name="chevron" />
              </Link>
            </nav>

            <div className="mobile-account__footer">
              <a href={donateUrl} target="_blank" rel="noreferrer">
                Поддержать проект
              </a>

              {profile && (
                <button type="button" onClick={() => void logout()}>
                  Выйти
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
