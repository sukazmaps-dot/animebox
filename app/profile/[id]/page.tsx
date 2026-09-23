import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPublicProfile } from '@/lib/public-profile-server';
import UserIdentity from '@/components/identity/UserIdentity';
import UserAvatarWithFrame from '@/components/profile/UserAvatarWithFrame';
import ProfileAnimeIdentity from '@/components/profile/ProfileAnimeIdentity';
import Icon from '@/components/Icon';
import FriendActionButton from '@/components/friends/FriendActionButton';
import { premiumMediaStyle, premiumStudioCssVariables } from '@/lib/premium-studio';
import { formatSeasonRange, seasonPlacementLabel } from '@/lib/seasons';
import { ACHIEVEMENT_RARITY_LABELS } from '@/lib/progression';

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


function formatWatchTime(activeMs: number) {
  const totalSeconds = Math.max(0, Math.floor(activeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}ч ${minutes}м`;
  if (minutes > 0) return `${minutes}м ${seconds}с`;
  return `${seconds}с`;
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
  const watchTime = formatWatchTime(profile.stats.activeMs);
  const premiumStyle = profile.premiumStudio
    ? (premiumStudioCssVariables(profile.premiumStudio) as CSSProperties)
    : undefined;

  return (
    <main
      className={`profile-v2 profile-v2--public premium-profile-theme--${profile.premiumTheme} ${profile.premiumStudio ? 'premium-profile-custom' : ''}`}
      style={premiumStyle}
    >
      <section className="profile-v2__hero">
        <div className="profile-v2__banner">
          {profile.bannerUrl ? (
            <picture className="profile-v2__banner-picture">
              {profile.bannerMobileUrl && profile.bannerMobileUrl !== profile.bannerUrl && (
                <source
                  media="(prefers-reduced-motion: reduce)"
                  srcSet={profile.bannerMobileUrl}
                />
              )}
              <img
                src={profile.bannerUrl}
                alt={`Баннер ${profile.username}`}
                className="profile-v2__banner-image"
                style={premiumMediaStyle(profile.bannerTransform) as CSSProperties}
              />
            </picture>
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
          <UserAvatarWithFrame
            src={profile.avatarUrl}
            mobileSrc={profile.avatarMobileUrl}
            alt={`Аватар ${profile.username}`}
            role={profile.role}
            sponsor={profile.sponsor}
            mediaTransform={profile.avatarTransform}
          />

          <div className="profile-v2__identity-main">
            <div className="profile-v2__title-row">
              <div>
                <div className="profile-v2__name-row">
                  <h1>
                    <UserIdentity
                      username={profile.username}
                      role={profile.role}
                      sponsor={profile.sponsor}
                      showLabel
                    />
                  </h1>

                  <span
                    className="inline-flex min-h-6 items-center rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 text-[9px] font-black tracking-[0.04em] text-violet-200"
                    title={`${profile.progression.totalXp.toLocaleString('ru-RU')} XP`}
                  >
                    LV.{profile.progression.level} · {profile.progression.rank}
                  </span>

                  {profile.premium && (
                    <span className="animebox-premium-badge" title="AnimeBox Premium">
                      <Icon name="crown" className="animebox-premium-badge__icon" size={15} weight="fill" />
                      Premium
                    </span>
                  )}

                  {profile.ogNumber && (
                    <span
                      className="animebox-og-badge"
                      title="Постоянный номер одного из первых 100 активных участников AnimeBox"
                    >
                      <span aria-hidden="true">◆</span>
                      FOUNDING #{String(profile.ogNumber).padStart(3, '0')}
                    </span>
                  )}
                </div>
                <p className="profile-v2__email">Публичный профиль AnimeBox</p>
              </div>

              <span className="profile-v2__public-badge">
                {profile.ogNumber ? 'Ранний тестер' : 'Участник сообщества'}
              </span>
            </div>

            <p className="profile-v2__bio">
              {profile.bio || 'Пользователь пока ничего о себе не рассказал.'}
            </p>

            <div className="profile-v2__meta">
              <span>В AnimeBox с {joinedDate}</span>
            </div>

            <div className="mt-4">
              <FriendActionButton targetUserId={profile.id} />
            </div>

            {profile.seasonTitles.length > 0 && (
              <div className="profile-v4__season-titles" aria-label="Сезонные титулы">
                {profile.seasonTitles.map((title) => (
                  <span
                    key={`${title.periodType}:${title.periodKey}:${title.place}`}
                    data-place={title.place}
                    title={formatSeasonRange(title.startsAt, title.endsAt)}
                  >
                    {seasonPlacementLabel(title.place, title.periodType)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <ProfileAnimeIdentity
        premium={profile.premium}
        foundingNumber={profile.ogNumber}
        level={profile.progression.level}
        rank={profile.progression.rank}
        stats={{
          episodes: profile.stats.episodes,
          titles: profile.stats.titles,
          activeMs: profile.stats.activeMs,
          comments: profile.stats.comments,
        }}
      />

      {profile.featuredAchievements.length > 0 && (
        <section className="profile-v4__featured">
          <div className="profile-v2__section-head">
            <div>
              <span className="profile-v2__eyebrow">Витрина профиля</span>
              <h2>Избранные достижения</h2>
              <p>Три достижения, которые пользователь решил показать первыми.</p>
            </div>
          </div>

          <div className="profile-v4__featured-grid">
            {profile.featuredAchievements.map((achievement) => (
              <article
                className="profile-v4__featured-card"
                data-rarity={achievement.rarity}
                key={achievement.code}
              >
                <img src={achievement.icon} alt="" width="58" height="58" />
                <div>
                  <span>{ACHIEVEMENT_RARITY_LABELS[achievement.rarity]}</span>
                  <strong>{achievement.title}</strong>
                  <p>{achievement.description}</p>
                </div>
                <b>+{achievement.xpReward} XP</b>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="profile-v2__stats" aria-label="Публичная статистика">
        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Просмотрено серий</span>
          <strong>{profile.stats.episodes}</strong>
          <small>Подтверждено плеером</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Завершено тайтлов</span>
          <strong>{profile.stats.titles}</strong>
          <small>Полностью просмотрены</small>
        </article>

        <article className="profile-v2__stat">
          <span className="profile-v2__stat-label">Время просмотра</span>
          <strong>{watchTime}</strong>
          <small>По данным плеера</small>
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
                data-rarity={achievement.rarity}
                key={achievement.code}
              >
                <img src={achievement.icon} alt="" width="52" height="52" />

                <div className="profile-v2__achievement-copy">
                  <div className="profile-v2__achievement-title">
                    <strong>{achievement.title}</strong>
                    <small>{formatAchievementDate(achievement.earnedAt)}</small>
                  </div>

                  <p>{achievement.description}</p>
                  <div className="profile-v3__achievement-meta">
                    <span data-rarity={achievement.rarity}>{ACHIEVEMENT_RARITY_LABELS[achievement.rarity]}</span>
                    <span>+{achievement.xpReward} XP</span>
                  </div>
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
