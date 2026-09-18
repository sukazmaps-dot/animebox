'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { useAuthState } from '@/components/AuthStateProvider';

export default function AuthUserButton() {
  const {
    profile,
    loading,
    signOut,
    telegramMiniApp,
    resumeTelegramAutoLogin,
  } = useAuthState();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  async function logout() {
    setOpen(false);
    await signOut();
    window.location.replace('/');
  }

  if (loading) {
    return <div className="auth-nav-loading" />;
  }

  if (!profile) {
    return (
      <div className="auth-nav-guest">
        {telegramMiniApp ? (
          <>
            <Link href="/login" className="auth-nav-login">
              Другой вход
            </Link>

            <button
              type="button"
              className="auth-nav-register auth-nav-telegram"
              onClick={resumeTelegramAutoLogin}
            >
              Войти через Telegram
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="auth-nav-login">
              Войти
            </Link>

            <Link href="/register" className="auth-nav-register">
              Регистрация
            </Link>
          </>
        )}
      </div>
    );
  }

  const username = profile.username?.trim() || 'Пользователь';

  const displayAvatarPath = profile.display_avatar_path || profile.avatar_path;
  const avatarUrl = displayAvatarPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(displayAvatarPath).data.publicUrl
    : '/default-avatar.webp';

  return (
    <div className="auth-user" ref={menuRef}>
      <button
        type="button"
        className={`auth-user__trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Меню аккаунта"
      >
        <span className="auth-user__avatar">
          <img src={avatarUrl} alt={`Аватар ${username}`} />
        </span>

        <span className="auth-user__username">{username}</span>

        <span className="auth-user__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="auth-user__dropdown">
          <div className="auth-user__profile">
            <span className="auth-user__profile-avatar">
              <img src={avatarUrl} alt={`Аватар ${username}`} />
            </span>

            <div>
              <strong>{username}</strong>
              <span>AnimeBox аккаунт</span>
            </div>
          </div>

          <div className="auth-user__divider" />

          <div className="auth-user__links">
            <Link href="/profile" onClick={() => setOpen(false)}>
              <span>Профиль</span>
              <small>→</small>
            </Link>

            <Link href="/list" onClick={() => setOpen(false)}>
              <span>Мой трекер</span>
              <small>→</small>
            </Link>

            <Link href="/favorites" onClick={() => setOpen(false)}>
              <span>Избранное</span>
              <small>→</small>
            </Link>

            <Link href="/premium" onClick={() => setOpen(false)}>
              <span>AnimeBox Premium</span>
              <small>→</small>
            </Link>
          </div>

          <div className="auth-user__divider" />

          <button
            type="button"
            className="auth-user__logout"
            onClick={() => void logout()}
          >
            Выйти из аккаунта
          </button>
        </div>
      )}
    </div>
  );
}
