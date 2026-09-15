'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

export default function AuthUserButton() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_path')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Profile load error:', error);
      }

      setProfile(data);
      setLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
    const supabase = createClient();

    await supabase.auth.signOut();

    setOpen(false);
    setProfile(null);

    window.location.href = '/';
  }

  if (loading) {
    return <div className="auth-nav-loading" />;
  }

  if (!profile) {
    return (
      <div className="auth-nav-guest">
        <Link
          href="/login"
          className="auth-nav-login"
        >
          Войти
        </Link>

        <Link
          href="/register"
          className="auth-nav-register"
        >
          Регистрация
        </Link>
      </div>
    );
  }

  const username =
    profile.username?.trim() || 'Пользователь';

  const supabase = createClient();

  const avatarUrl = profile.avatar_path
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(profile.avatar_path)
        .data.publicUrl
    : '/default-avatar.webp';

  return (
    <div
      className="auth-user"
      ref={menuRef}
    >
      <button
        type="button"
        className={`auth-user__trigger ${
          open ? 'is-open' : ''
        }`}
        onClick={() =>
          setOpen((current) => !current)
        }
        aria-expanded={open}
        aria-label="Меню аккаунта"
      >
        <span className="auth-user__avatar">
          <img
            src={avatarUrl}
            alt={`Аватар ${username}`}
          />
        </span>

        <span className="auth-user__username">
          {username}
        </span>

        <span className="auth-user__chevron">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="auth-user__dropdown">
          <div className="auth-user__profile">
            <span className="auth-user__profile-avatar">
              <img
                src={avatarUrl}
                alt={`Аватар ${username}`}
              />
            </span>

            <div>
              <strong>{username}</strong>
              <span>AnimeBox аккаунт</span>
            </div>
          </div>

          <div className="auth-user__divider" />

          <div className="auth-user__links">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
            >
              <span>Профиль</span>
              <small>→</small>
            </Link>

            <Link
              href="/list"
              onClick={() => setOpen(false)}
            >
              <span>Мой трекер</span>
              <small>→</small>
            </Link>

            <Link
              href="/favorites"
              onClick={() => setOpen(false)}
            >
              <span>Избранное</span>
              <small>→</small>
            </Link>
          </div>

          <div className="auth-user__divider" />

          <button
            type="button"
            className="auth-user__logout"
            onClick={logout}
          >
            Выйти из аккаунта
          </button>
        </div>
      )}
    </div>
  );
}