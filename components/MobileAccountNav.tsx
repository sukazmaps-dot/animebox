'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

type Props = {
  pathname: string;
};

const telegramUrl = 'https://t.me/yourAnimeBox';
const donateUrl = 'https://donatepay.ru/don/Armlet';

export default function MobileAccountNav({ pathname }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_path')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Mobile profile load error:', error);
      }

      setProfile(
        data ?? {
          id: user.id,
          username:
            (user.user_metadata?.username as string | undefined) ??
            (user.user_metadata?.full_name as string | undefined) ??
            user.email?.split('@')[0] ??
            null,
          avatar_path: null,
        },
      );
      setLoading(false);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

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
    pathname.startsWith('/about');

  async function logout() {
    await supabase.auth.signOut();
    setProfile(null);
    setOpen(false);
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
          {profile ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <Icon name="user" />
          )}
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
