'use client';
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

import FriendActionButton from '@/components/friends/FriendActionButton';
import StreakDisplay from '@/components/profile/StreakDisplay';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import PremiumProfileAtmosphere from '@/components/premium/PremiumProfileAtmosphere';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import { isLevelFrameKey, levelFrameAvatarScale } from '@/lib/progression';
import {
  premiumMediaStyle,
  type PremiumAtmosphereEffect,
  type PremiumEntranceEffect,
  type PremiumHeroStyle,
  type PremiumMediaTransform,
  type PremiumMotionMode,
  type PremiumNicknameEffect,
  type PremiumSurfaceStyle,
} from '@/lib/premium-studio';

import styles from './ProfilePreview.module.css';

type PreviewData = {
  id: string;
  username: string;
  bio: string | null;
  createdAt: string;
  avatarUrl: string;
  avatarStaticUrl: string;
  bannerUrl: string | null;
  bannerStaticUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  bannerTransform: PremiumMediaTransform;
  premium: boolean;
  premiumTheme: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  atmosphereEffect: PremiumAtmosphereEffect;
  atmosphereIntensity: number;
  motionMode: PremiumMotionMode;
  entranceEffect: PremiumEntranceEffect;
  nicknameEffect: PremiumNicknameEffect;
  heroStyle: PremiumHeroStyle;
  surfaceStyle: PremiumSurfaceStyle;
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
  profileFrameKey: string | null;
  progression: {
    level: number;
    rank: string;
    totalXp: number;
  };
  streak: {
    current: number;
    longest: number;
    lastActiveDate: string | null;
    todayKey: string;
  };
};

type CachedPreview = {
  expiresAt: number;
  data: PreviewData;
};

const previewCache = new Map<string, CachedPreview>();
const CACHE_TTL = 60_000;

async function fetchPreview(userId: string) {
  const cached = previewCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(
    `/api/profile/preview/${encodeURIComponent(userId)}`,
    { cache: 'no-store' },
  );
  const payload = (await response.json()) as PreviewData & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Не удалось загрузить мини-профиль.');
  }

  previewCache.set(userId, {
    expiresAt: Date.now() + CACHE_TTL,
    data: payload,
  });

  return payload;
}

function joinedLabel(value: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'недавно';
  }
}

export default function ProfilePreview({
  userId,
  username,
  children,
  className = '',
}: {
  userId: string;
  username?: string;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(
    () => previewCache.get(userId)?.data ?? null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const [placement, setPlacement] = useState<'above' | 'below'>('below');

  useEffect(() => {
    if (!open) return;

    let active = true;
    const cached = previewCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      queueMicrotask(() => {
        if (active) setData(cached.data);
      });
      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError('');
    });

    void fetchPreview(userId)
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось загрузить мини-профиль.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;

    const mobileQuery = window.matchMedia('(max-width: 640px)');

    const updatePosition = () => {
      if (mobileQuery.matches) return;

      const trigger = triggerRef.current?.getBoundingClientRect();
      const card = cardRef.current?.getBoundingClientRect();
      if (!trigger || !card) return;

      const margin = 12;
      const gap = 12;
      const cardWidth = card.width;
      const cardHeight = card.height;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const preferredLeft =
        trigger.left + trigger.width / 2 - cardWidth / 2;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        Math.max(margin, viewportWidth - cardWidth - margin),
      );

      const spaceBelow = viewportHeight - trigger.bottom - margin;
      const spaceAbove = trigger.top - margin;
      const openAbove = spaceBelow < cardHeight && spaceAbove > spaceBelow;

      const top = openAbove
        ? Math.max(margin, trigger.top - gap - cardHeight)
        : Math.min(
            trigger.bottom + gap,
            Math.max(margin, viewportHeight - cardHeight - margin),
          );

      setPlacement(openAbove ? 'above' : 'below');
      setPosition({ top, left });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onScroll = (event: Event) => {
      if (mobileQuery.matches) return;
      const target = event.target;
      if (target instanceof Node && cardRef.current?.contains(target)) return;

      // Desktop popovers close on page/parent scroll instead of chasing the
      // trigger around the viewport, which looks unstable and cheap.
      setOpen(false);
    };

    const frame = window.requestAnimationFrame(updatePosition);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            window.requestAnimationFrame(updatePosition);
          })
        : null;

    if (cardRef.current) observer?.observe(cardRef.current);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', updatePosition);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 640px)').matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const atmosphereIntensity = data
    ? Math.max(0, Math.min(100, data.atmosphereIntensity))
    : 0;
  const atmosphereBaseAlpha =
    atmosphereIntensity <= 0
      ? 0
      : 0.14 + (atmosphereIntensity / 100) * 0.26;
  const atmosphereAlpha = data
    ? data.motionMode === 'live'
      ? Math.min(0.46, atmosphereBaseAlpha + 0.08)
      : data.motionMode === 'off'
        ? Math.min(0.28, atmosphereBaseAlpha * 0.76)
        : atmosphereBaseAlpha
    : 0;
  const atmosphereCleanAlpha = Math.max(0.08, atmosphereAlpha * 0.56);

  const themeStyle = data
    ? ({
        '--profile-preview-primary': data.primaryColor,
        '--profile-preview-accent': data.accentColor,
        '--profile-preview-text': data.textColor,
        '--profile-preview-atmosphere-alpha': String(atmosphereAlpha),
        '--profile-preview-atmosphere-clean-alpha': String(atmosphereCleanAlpha),
      } as CSSProperties)
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Открыть мини-профиль ${username || 'пользователя'}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.layer}
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setOpen(false);
              }}
            >
              <section
                ref={cardRef}
                className={styles.card}
                data-placement={placement}
                data-premium={data?.premium ? 'true' : 'false'}
                data-motion={data?.premium ? data.motionMode : 'off'}
                data-entrance={data?.premium ? data.entranceEffect : 'none'}
                data-hero={data?.premium ? data.heroStyle : 'clean'}
                data-surface={data?.premium ? data.surfaceStyle : 'ink'}
                style={{
                  ...themeStyle,
                  top: position.top,
                  left: position.left,
                }}
                role="dialog"
                aria-modal="true"
                aria-label={data ? `Мини-профиль ${data.username}` : 'Мини-профиль'}
              >
                {data?.premium && data.atmosphereEffect !== 'none' && (
                  <PremiumProfileAtmosphere
                    effect={data.atmosphereEffect}
                    motion={data.motionMode}
                    variant="compact"
                    className={styles.atmosphere}
                  />
                )}

                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть мини-профиль"
                >
                  ×
                </button>

                {loading && !data ? (
                  <div className={styles.state}>Загружаем профиль…</div>
                ) : error && !data ? (
                  <div className={styles.state}>
                    <strong>Не удалось открыть профиль</strong>
                    <span>{error}</span>
                  </div>
                ) : data ? (
                  <>
                    <div className={styles.hero}>
                      <div className={styles.banner}>
                        {data.bannerUrl ? (
                          <picture className={styles.bannerMedia}>
                            {data.bannerStaticUrl &&
                              data.bannerStaticUrl !== data.bannerUrl && (
                                <source
                                  media="(prefers-reduced-motion: reduce)"
                                  srcSet={data.bannerStaticUrl}
                                />
                              )}
                            <img
                              src={
                                data.premium &&
                                data.motionMode === 'off' &&
                                data.bannerStaticUrl
                                  ? data.bannerStaticUrl
                                  : data.bannerUrl
                              }
                              alt=""
                              loading="eager"
                              decoding="async"
                              style={premiumMediaStyle(data.bannerTransform)}
                            />
                          </picture>
                        ) : (
                          <img
                            src="/brand/profile-banner-default.webp"
                            alt=""
                            loading="eager"
                            decoding="async"
                          />
                        )}
                      </div>

                      <div className={styles.heroIdentity}>
                        <span
                          className={`${styles.avatarShell} ${data.profileFrameKey ? styles.avatarShellSeason : ''}`}
                          data-milestone-frame={isLevelFrameKey(data.profileFrameKey) ? 'true' : 'false'}
                          data-premium={data.premium ? 'true' : 'false'}
                        >
                          <picture
                            className={styles.avatarMedia}
                            style={
                              isLevelFrameKey(data.profileFrameKey)
                                ? {
                                    width: `${(levelFrameAvatarScale(data.profileFrameKey) ?? 0.58) * 100}%`,
                                    height: `${(levelFrameAvatarScale(data.profileFrameKey) ?? 0.58) * 100}%`,
                                  }
                                : undefined
                            }
                          >
                            {data.avatarStaticUrl !== data.avatarUrl && (
                              <source
                                media="(prefers-reduced-motion: reduce)"
                                srcSet={data.avatarStaticUrl}
                              />
                            )}
                            <img
                              src={
                                data.premium &&
                                data.motionMode === 'off' &&
                                data.avatarStaticUrl
                                  ? data.avatarStaticUrl
                                  : data.avatarUrl
                              }
                              alt=""
                              width={72}
                              height={72}
                              loading="eager"
                              decoding="async"
                              style={premiumMediaStyle(data.avatarTransform)}
                            />
                          </picture>
                          {data.profileFrameKey && (
                            <ProfileFrameOverlay
                              frameKey={data.profileFrameKey}
                              premium={data.premium && data.motionMode !== 'off'}
                              className={styles.seasonFrameOverlay}
                            />
                          )}
                        </span>

                        <div className={styles.identityCopy}>
                          <span className={styles.kicker}>AnimeBox profile</span>
                          <span className={styles.nameLine}>
                            <span
                              className={styles.nickname}
                              data-effect={data.premium ? data.nicknameEffect : 'none'}
                            >
                              <UserIdentity
                                username={data.username}
                                role={data.role}
                                sponsor={data.sponsor}
                                compact
                              />
                            </span>
                            {data.premium && (
                              <span className={styles.premiumBadge}>Premium</span>
                            )}
                          </span>
                          <span className={styles.levelRow}>
                            <span className={styles.levelBadge}>LVL {data.progression.level}</span>
                            <span className={styles.rankLabel}>{data.progression.rank}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.body}>
                      {data.bio && <p className={styles.bio}>{data.bio}</p>}

                      <div className={styles.metaGrid}>
                        <StreakDisplay
                          current={data.streak.current}
                          longest={data.streak.longest}
                          lastActiveDate={data.streak.lastActiveDate}
                          todayKey={data.streak.todayKey}
                          variant="compact"
                        />

                        <div className={styles.metaCard}>
                          <span className={styles.metaGlyph} aria-hidden="true">✦</span>
                          <span>
                            <small>В AnimeBox</small>
                            <strong>{joinedLabel(data.createdAt)}</strong>
                            <em>{data.progression.totalXp.toLocaleString('ru-RU')} XP</em>
                          </span>
                        </div>
                      </div>

                      <div className={styles.actions}>
                        <FriendActionButton
                          targetUserId={data.id}
                          variant="profile-preview"
                        />
                        <Link
                          href={`/profile/${data.id}`}
                          className={styles.openProfile}
                          onClick={() => setOpen(false)}
                        >
                          Профиль →
                        </Link>
                      </div>
                    </div>
                  </>
                ) : null}
              </section>
            </div>,
            (document.fullscreenElement ?? document.body),
          )
        : null}
    </>
  );
}
