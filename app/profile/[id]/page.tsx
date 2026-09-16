import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPublicProfile } from '@/lib/public-profile-server';

type Props = {
  params: Promise<{ id: string }>;
};


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) {
    return {
      title: 'Профиль не найден',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${profile.username} — профиль`,
    description: profile.bio || `Публичный профиль ${profile.username} в AnimeBox.`,
    robots: { index: false, follow: true },
  };
}

function formatJoinedDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'недавно';
  }
}

function formatAchievementDate(value: string | null) {
  if (!value) return 'Получено';

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'Получено';
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) notFound();

  const joinedDate = formatJoinedDate(profile.createdAt);
  const watchHours = Math.floor(profile.stats.minutes / 60);
  const watchMinutes = profile.stats.minutes % 60;

  return (
    <main className="profile-v2 profile-v2--public">
      <section className="profile-v2__hero">
        <div className="profile-v2__banner">
          {profile.bannerUrl ? (
            <img
              src={profile.bannerUrl}
              alt={`Баннер ${profile.username}`}
              className="profile-v2__banner-image"
            />
          ) : (
            <img
              src="/brand/profile-banner-default.webp"
              alt=""
              aria-hidden="true"
              className="profile-v2__banner-image profile-v2__banner-image--default"
            />
          )}

          <div className="profile-v2__banner-shade" />
        </div>

        <div className="profile-v2__identity">
          <div className="profile-v2__avatar-wrap">
            <div className="profile-v2__avatar-static">
              <img src={profile.avatarUrl} alt={`Аватар ${profile.username}`} />
            </div>
          </div>

          <div className="profile-v2__identity-main">
            <div className="profile-v2__title-row">
              <div>
                <h1>{profile.username}</h1>
                <p className="profile-v2__email">Публичный профиль AnimeBox</p>
              </div>

              <span className="profile-v2__public-badge">Участник сообщества</span>
            </div>

            <p className="profile-v2__bio">
              {profile.bio || 'Пользователь пока ничего о себе не рассказал.'}
            </p>

            <div className="profile-v2__meta">
              <span>В AnimeBox с {joinedDate}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="profile-v2__stats" aria-label="Публичная статистика">
        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Просмотрено серий</span>
          <strong>{profile.stats.episodes}</strong>
          <small>Отмечено просмотренными</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Завершено тайтлов</span>
          <strong>{profile.stats.titles}</strong>
          <small>Полностью просмотрены</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Время просмотра</span>
          <strong>
            {watchHours}<em>ч</em> {watchMinutes}<em>м</em>
          </strong>
          <small>Примерная статистика</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Комментарии</span>
          <strong>{profile.stats.comments}</strong>
          <small>В обсуждениях AnimeBox</small>
        </article>
      </section>

      <section className="profile-v2__achievements profile-v2__public-achievements">
        <div className="profile-v2__section-head">
          <div>
            <span className="profile-v2__eyebrow">Прогресс</span>
            <h2>Достижения</h2>
            <p>Открытые достижения пользователя.</p>
          </div>
        </div>

        {profile.achievements.length ? (
          <div className="profile-v2__achievement-list profile-v2__achievement-list--public">
            {profile.achievements.map((achievement) => (
              <article
                className="profile-v2__achievement is-unlocked"
                key={achievement.code}
              >
                <img src={achievement.icon} alt="" width="52" height="52" />

                <div className="profile-v2__achievement-copy">
                  <div className="profile-v2__achievement-title">
                    <strong>{achievement.title}</strong>
                    <small>{formatAchievementDate(achievement.earnedAt)}</small>
                  </div>

                  <p>{achievement.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-v2__public-empty">
            <img src="/brand/brand-mark.png" alt="" aria-hidden="true" />
            <div>
              <strong>Пока без открытых достижений</strong>
              <p>Они появятся здесь по мере активности на AnimeBox.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
