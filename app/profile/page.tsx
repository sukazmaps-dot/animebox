'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { readProfileCache, saveProfileCache } from '@/lib/profile-cache';
import { notifyAuthChanged } from '@/lib/auth-events';
import { isTelegramMiniAppRuntime } from '@/lib/telegram-auto-login';
import { useAuthState } from '@/components/AuthStateProvider';
import CommunityProfile from '@/components/CommunityProfile';
import ProfileEditModal from '@/components/ProfileEditModal';
import SponsorDashboard from '@/components/monetization/SponsorDashboard';
import MySponsorBadge from '@/components/monetization/MySponsorBadge';

type Profile = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
  og_number: number | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    telegramMiniApp,
    telegramAutoLoginDisabled,
  } = useAuthState();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const inTelegram = telegramMiniApp || isTelegramMiniAppRuntime();
    const waitingForTelegramAuth =
      inTelegram && !telegramAutoLoginDisabled && !user;

    if (authLoading || waitingForTelegramAuth) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setProfile(null);
        setLoading(true);
        setError('');
      }, 0);

      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    if (!user) {
      router.replace('/login');

      return () => {
        active = false;
      };
    }

    const currentUser = user;

    async function loadProfile() {
      setLoading(true);
      setError('');
      setEmail(currentUser.email ?? '');

      const cachedProfile = readProfileCache<Profile>(currentUser.id);
      if (cachedProfile?.username?.trim()) {
        // Username/avatar can stay cached, but OG must be refreshed every time:
        // a user can earn the badge immediately after adding their first title.
        const cachedOgResult = await supabase
          .from('og_members')
          .select('og_number')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (!active) return;

        const nextCachedProfile = {
          ...cachedProfile,
          og_number:
            !cachedOgResult.error &&
            typeof cachedOgResult.data?.og_number === 'number'
              ? cachedOgResult.data.og_number
              : null,
        };

        if (cachedOgResult.error) {
          console.error('OG badge lookup:', cachedOgResult.error);
        }

        setProfile(nextCachedProfile);
        saveProfileCache(currentUser.id, nextCachedProfile);
        setLoading(false);
        return;
      }

      const [profileResult, ogResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, username, bio, avatar_path, banner_path, created_at',
          )
          .eq('id', currentUser.id)
          .single(),
        supabase
          .from('og_members')
          .select('og_number')
          .eq('user_id', currentUser.id)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (profileResult.error) {
        console.error(profileResult.error);
        setError('Не удалось загрузить профиль.');
        setLoading(false);
        return;
      }

      if (ogResult.error) {
        // Профиль должен продолжить работать даже до применения OG-миграции.
        console.error('OG badge lookup:', ogResult.error);
      }

      const profileData = {
        ...profileResult.data,
        og_number:
          typeof ogResult.data?.og_number === 'number'
            ? ogResult.data.og_number
            : null,
      };

      if (!profileData.username?.trim()) {
        router.replace('/onboarding');
        return;
      }

      setProfile(profileData);
      saveProfileCache(currentUser.id, profileData);
      setLoading(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [
    authLoading,
    router,
    telegramAutoLoginDisabled,
    telegramMiniApp,
    user,
  ]);

  if (loading) {
    return (
      <main className="profile-v2">
        <div className="profile-v2__loading">
          Загружаем профиль...
        </div>
      </main>
    );
  }

  if (!profile || error) {
    return (
      <main className="profile-v2">
        <div className="profile-v2__loading">
          {error || 'Профиль не найден'}
        </div>
      </main>
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

  const bannerUrl = profile.banner_path
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(profile.banner_path)
        .data.publicUrl
    : null;

  const joinedDate = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(profile.created_at));

  return (
    <main className="profile-v2">
      {/* PROFILE HERO */}

      <section className="profile-v2__hero">
        <div className="profile-v2__banner">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt="Баннер профиля"
              className="profile-v2__banner-image"
            />
          ) : (
            <img
              src="/brand/profile-banner-default.webp"
              alt=""
              className="profile-v2__banner-image profile-v2__banner-image--default"
              aria-hidden="true"
            />
          )}

          <div className="profile-v2__banner-shade" />
        </div>

        <div className="profile-v2__identity">
          <div className="profile-v2__avatar-wrap">
            <div className="profile-v2__avatar-static">
              <img
                src={avatarUrl}
                alt={`Аватар ${username}`}
              />
            </div>
          </div>

          <div className="profile-v2__identity-main">
            <div className="profile-v2__title-row">
              <div>
                <div className="profile-v2__name-row">
                  <h1><MySponsorBadge username={username} /></h1>

                  {profile.og_number && (
                    <span
                      className="animebox-og-badge"
                      title="Один из первых 100 активных пользователей AnimeBox"
                    >
                      <span aria-hidden="true">◆</span>
                      OG #{String(profile.og_number).padStart(3, '0')}
                    </span>
                  )}
                </div>

                <p className="profile-v2__email">
                  {email}
                </p>
              </div>

              <button
                className="profile-v2__edit"
                type="button"
                onClick={() => setEditOpen(true)}
              >
                Редактировать профиль
              </button>
            </div>

            <p className="profile-v2__bio">
              {profile.bio ||
                'Расскажи немного о себе и своих любимых аниме.'}
            </p>

            <div className="profile-v2__meta">
              <span>
                В AnimeBox с {joinedDate}
              </span>

              <span className="profile-v2__online">
                Аккаунт активен
              </span>
            </div>
          </div>
        </div>
      </section>

      <SponsorDashboard history />
      <CommunityProfile />

      {/* FAVORITES */}

      <section className="profile-v2__bottom-card">
        <div>
          <span className="profile-v2__eyebrow">
            Коллекция
          </span>

          <h2>Избранное</h2>

          <p>
            Все тайтлы, которые ты сохранил,
            находятся в одном месте.
          </p>
        </div>

        <Link href="/favorites">
          Открыть избранное →
        </Link>
      </section>

      <section className="profile-v2__bottom-card">
        <div>
          <span className="profile-v2__eyebrow">
            Telegram
          </span>

          <h2>Уведомления о новых сериях</h2>

          <p>
            Управляй подписками на тайтлы и проверь связь с ботом AnimeBox.
          </p>
        </div>

        <Link href="/notifications">
          Настроить уведомления →
        </Link>
      </section>

      {/* EDIT PROFILE MODAL */}

      <ProfileEditModal
        open={editOpen}
        username={username}
        bio={profile.bio}
        avatarPath={profile.avatar_path}
        bannerPath={profile.banner_path}
        onClose={() => setEditOpen(false)}
        onSaved={(data) => {
          setProfile((current) => {
            if (!current) return current;

            const nextProfile = {
              ...current,
              username: data.username,
              bio: data.bio,
              avatar_path: data.avatar_path,
              banner_path: data.banner_path,
            };

            saveProfileCache(current.id, nextProfile);
            notifyAuthChanged({
              userId: current.id,
              profile: {
                id: current.id,
                username: nextProfile.username,
                avatar_path: nextProfile.avatar_path,
              },
            });
            return nextProfile;
          });
        }}
      />
    </main>
  );
}