'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import ProfileEditModal from '@/components/ProfileEditModal';

type Profile = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
};

type TrackerItem = {
  status: 'watching' | 'planned' | 'completed' | 'dropped';
  current_episode: number;
};

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [tracker, setTracker] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/login');
        return;
      }

      setEmail(user.email ?? '');

      const { data: profileData, error: profileError } =
        await supabase
          .from('profiles')
          .select(
            'id, username, bio, avatar_path, banner_path, created_at',
          )
          .eq('id', user.id)
          .single();

      if (profileError) {
        console.error(profileError);
        setError('Не удалось загрузить профиль.');
        setLoading(false);
        return;
      }

      if (!profileData.username?.trim()) {
        router.replace('/onboarding');
        return;
      }

      const { data: trackerData, error: trackerError } =
        await supabase
          .from('user_anime')
          .select('status, current_episode')
          .eq('user_id', user.id);

      if (trackerError) {
        console.error(trackerError);
      }

      setProfile(profileData);
      setTracker((trackerData as TrackerItem[]) ?? []);
      setLoading(false);
    }

    loadProfile();
  }, [router]);

  const stats = useMemo(() => {
    const watching = tracker.filter(
      (item) => item.status === 'watching',
    ).length;

    const planned = tracker.filter(
      (item) => item.status === 'planned',
    ).length;

    const completed = tracker.filter(
      (item) => item.status === 'completed',
    ).length;

    const episodes = tracker.reduce(
      (sum, item) => sum + item.current_episode,
      0,
    );

    return {
      watching,
      planned,
      completed,
      episodes,
    };
  }, [tracker]);

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
            <div className="profile-v2__banner-default" />
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
                <h1>{username}</h1>

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

      {/* STATS */}

      <section className="profile-v2__stats">
        <div className="profile-v2__stat">
          <strong>{stats.watching}</strong>
          <span>Смотрю</span>
        </div>

        <div className="profile-v2__stat">
          <strong>{stats.completed}</strong>
          <span>Просмотрено</span>
        </div>

        <div className="profile-v2__stat">
          <strong>{stats.planned}</strong>
          <span>В планах</span>
        </div>

        <div className="profile-v2__stat">
          <strong>{stats.episodes}</strong>
          <span>Серий</span>
        </div>
      </section>

      {/* CONTENT */}

      <section className="profile-v2__content">
        <div className="profile-v2__library">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">
                Библиотека
              </span>

              <h2>Мои аниме</h2>
            </div>

            <Link href="/list">
              Открыть трекер →
            </Link>
          </div>

          <div className="profile-v2__library-empty">
            <div className="profile-v2__library-icon">
              ◎
            </div>

            <strong>
              Здесь появится твоя библиотека
            </strong>

            <p>
              Начни добавлять аниме в «Смотрю»,
              «В планах» или «Просмотрено».
            </p>

            <Link href="/search">
              Найти аниме
            </Link>
          </div>
        </div>

        <aside className="profile-v2__achievements">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">
                Прогресс
              </span>

              <h2>Достижения</h2>
            </div>
          </div>

          <div className="profile-v2__achievement-list">
            <div className="profile-v2__achievement is-unlocked">
              <div>✦</div>

              <span>
                <strong>
                  Добро пожаловать
                </strong>

                <small>
                  Создан аккаунт AnimeBox
                </small>
              </span>
            </div>

            <div className="profile-v2__achievement">
              <div>◇</div>

              <span>
                <strong>
                  Первый шаг
                </strong>

                <small>
                  Добавь первое аниме
                </small>
              </span>
            </div>

            <div className="profile-v2__achievement">
              <div>◇</div>

              <span>
                <strong>
                  Марафонец
                </strong>

                <small>
                  Посмотри 100 серий
                </small>
              </span>
            </div>
          </div>

          <div className="profile-v2__achievement-note">
            Полная система достижений появится вместе
            с прогрессом просмотра.
          </div>
        </aside>
      </section>

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

      {/* EDIT PROFILE MODAL */}

      <ProfileEditModal
        open={editOpen}
        username={username}
        bio={profile.bio}
        avatarPath={profile.avatar_path}
        bannerPath={profile.banner_path}
        onClose={() => setEditOpen(false)}
        onSaved={(data) => {
          setProfile((current) =>
            current
              ? {
                  ...current,
                  username: data.username,
                  bio: data.bio,
                  avatar_path:
                    data.avatar_path,
                  banner_path:
                    data.banner_path,
                }
              : current,
          );
        }}
      />
    </main>
  );
}