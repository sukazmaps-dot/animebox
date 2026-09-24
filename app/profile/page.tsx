'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { readProfileCache, saveProfileCache } from '@/lib/profile-cache';
import { isTelegramMiniAppRuntime } from '@/lib/telegram-auto-login';
import { useAuthState } from '@/components/AuthStateProvider';
import CommunityProfile from '@/components/CommunityProfile';
import SponsorDashboard from '@/components/monetization/SponsorDashboard';
import MySponsorBadge from '@/components/monetization/MySponsorBadge';
import UserAvatarWithFrame from '@/components/profile/UserAvatarWithFrame';
import ProfileAnimeIdentityLoader from '@/components/profile/ProfileAnimeIdentityLoader';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import CurrentPremiumBadge from '@/components/premium/CurrentPremiumBadge';
import {
  DEFAULT_PREMIUM_STUDIO_SETTINGS,
  premiumMediaStyle,
  premiumStudioCssVariables,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';
import { resolveProfileAppearance } from '@/lib/profile-appearance';

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
    profile: authProfile,
    loading: authLoading,
    telegramMiniApp,
    telegramAutoLoginDisabled,
  } = useAuthState();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [premiumStudio, setPremiumStudio] = useState<PremiumStudioSettings | null>(null);
  const [premiumActive, setPremiumActive] = useState(false);

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
      setError('');
      setEmail(currentUser.email ?? '');

      const cachedProfile = readProfileCache<Profile>(currentUser.id);
      if (cachedProfile?.username?.trim()) {
        // Returning visitors should see the hero immediately. OG is refreshed
        // in the background instead of blocking the whole profile.
        setProfile(cachedProfile);
        setLoading(false);

        void supabase
          .from('og_members')
          .select('og_number')
          .eq('user_id', currentUser.id)
          .maybeSingle()
          .then((cachedOgResult) => {
            if (!active) return;
            if (cachedOgResult.error) {
              console.error('OG badge lookup:', cachedOgResult.error);
              return;
            }

            const ogNumber =
              typeof cachedOgResult.data?.og_number === 'number'
                ? cachedOgResult.data.og_number
                : null;

            setProfile((current) => {
              if (!current || current.id !== currentUser.id) return current;
              if (current.og_number === ogNumber) return current;
              const next = { ...current, og_number: ogNumber };
              saveProfileCache(currentUser.id, next);
              return next;
            });
          });
        return;
      }

      let showedOptimisticProfile = false;
      if (
        authProfile?.id === currentUser.id &&
        authProfile.username?.trim()
      ) {
        setProfile({
          id: currentUser.id,
          username: authProfile.username,
          bio: null,
          avatar_path: authProfile.avatar_path,
          banner_path: null,
          created_at: currentUser.created_at,
          og_number: null,
        });
        setLoading(false);
        showedOptimisticProfile = true;
      } else {
        setLoading(true);
      }

      const [profileResult, ogResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, bio, avatar_path, banner_path, created_at')
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
        if (!showedOptimisticProfile) {
          setError('Не удалось загрузить профиль.');
          setLoading(false);
        }
        return;
      }

      if (ogResult.error) {
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
    authProfile,
    router,
    telegramAutoLoginDisabled,
    telegramMiniApp,
    user,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    const loadStudio = () => {
      void fetch('/api/premium/studio', { cache: 'no-store' })
        .then(async (response) => {
          const payload = (await response.json()) as {
            allowed?: boolean;
            settings?: PremiumStudioSettings;
          };
          if (!response.ok || !active) return;
          setPremiumStudio(payload.settings ?? DEFAULT_PREMIUM_STUDIO_SETTINGS);
          setPremiumActive(Boolean(payload.allowed));
        })
        .catch(() => {
          if (active) {
            setPremiumStudio(null);
            setPremiumActive(false);
          }
        });
    };

    loadStudio();
    window.addEventListener('animebox:premium-studio-updated', loadStudio);
    window.addEventListener('animebox:entitlements-changed', loadStudio);

    return () => {
      active = false;
      window.removeEventListener('animebox:premium-studio-updated', loadStudio);
      window.removeEventListener('animebox:entitlements-changed', loadStudio);
    };
  }, [user?.id]);

  if (loading) {
    return (
      <main className="profile-v2">
        <div className="profile-v2__loading">
          <AnimeBoxLoader label="Загружаем профиль…" size={52} />
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

  const appearance = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio,
    premiumActive,
    premiumMediaActive: premiumActive,
  });
  const mobileAppearance = resolveProfileAppearance({
    baseAvatarPath: profile.avatar_path,
    baseBannerPath: profile.banner_path,
    premiumStudio,
    premiumActive,
    premiumMediaActive: false,
  });

  const avatarUrl = appearance.avatarPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(appearance.avatarPath)
        .data.publicUrl
    : '/default-avatar.webp';

  const bannerUrl = appearance.bannerPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(appearance.bannerPath)
        .data.publicUrl
    : null;

  const mobileAvatarUrl = mobileAppearance.avatarPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(mobileAppearance.avatarPath)
        .data.publicUrl
    : '/default-avatar.webp';

  const mobileBannerUrl = mobileAppearance.bannerPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(mobileAppearance.bannerPath)
        .data.publicUrl
    : null;

  const premiumStyle = appearance.premiumStudio
    ? (premiumStudioCssVariables(appearance.premiumStudio) as CSSProperties)
    : undefined;

  const joinedDate = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(profile.created_at));

  return (
    <main
      className={`profile-v2 premium-profile-theme--${appearance.premiumStudio?.theme ?? 'default'} ${appearance.premiumStudio ? 'premium-profile-custom' : ''}`}
      style={premiumStyle}
    >
      {/* PROFILE HERO */}

      <section className="profile-v2__hero">
        <div className="profile-v2__banner">
          {bannerUrl ? (
            <picture className="profile-v2__banner-picture">
              {mobileBannerUrl && mobileBannerUrl !== bannerUrl && (
                <source
                  media="(prefers-reduced-motion: reduce)"
                  srcSet={mobileBannerUrl}
                />
              )}
              <img
                src={bannerUrl}
                alt="Баннер профиля"
                className="profile-v2__banner-image"
                style={premiumMediaStyle(appearance.bannerTransform) as CSSProperties}
              />
            </picture>
          ) : (
            <div
              className="profile-v2__banner-default"
              aria-hidden="true"
            />
          )}

          <div className="profile-v2__banner-shade" />
        </div>

        <div className="profile-v2__identity">
          <UserAvatarWithFrame
            src={avatarUrl}
            mobileSrc={mobileAvatarUrl}
            alt={`Аватар ${username}`}
            loadCurrentIdentity
            mediaTransform={appearance.avatarTransform}
          />

          <div className="profile-v2__identity-main">
            <div className="profile-v2__title-row">
              <div>
                <div className="profile-v2__name-row">
                  <h1><MySponsorBadge username={username} /></h1>

                  <CurrentPremiumBadge />

                  {profile.og_number && (
                    <span
                      className="animebox-og-badge"
                      title="Постоянный номер одного из первых 100 активных участников AnimeBox"
                    >
                      <span aria-hidden="true">◆</span>
                      FOUNDING #{String(profile.og_number).padStart(3, '0')}
                    </span>
                  )}
                </div>

                <p className="profile-v2__email">
                  {email}
                </p>
              </div>

              <Link
                className="profile-v2__edit"
                href="/profile/edit"
              >
                Редактировать профиль
              </Link>
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
      <ProfileAnimeIdentityLoader
        premium={premiumActive}
        foundingNumber={profile.og_number}
      />
      <CommunityProfile />

      <section className="profile-v2__bottom-card profile-v2__bottom-card--premium">
        <div>
          <span className="profile-v2__eyebrow">AnimeBox Premium</span>
          <h2>Редактор стиля</h2>
          <p>
            Профиль, оформление и Premium-возможности теперь настраиваются в одном месте.
          </p>
        </div>

        <Link href="/profile/edit?tab=style">
          Открыть редактор →
        </Link>
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

    </main>
  );
}