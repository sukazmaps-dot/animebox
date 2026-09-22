'use client';
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

import FriendActionButton from '@/components/friends/FriendActionButton';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import {
  premiumMediaStyle,
  type PremiumMediaTransform,
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
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
  progression: {
    level: number;
    rank: string;
    totalXp: number;
  };
  streak: {
    current: number;
    longest: number;
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

  const themeStyle = data
    ? ({
        '--profile-preview-primary': data.primaryColor,
        '--profile-preview-accent': data.accentColor,
        '--profile-preview-text': data.textColor,
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
                style={{
                  ...themeStyle,
                  top: position.top,
                  left: position.left,
                }}
                role="dialog"
                aria-modal="true"
                aria-label={data ? `Мини-профиль ${data.username}` : 'Мини-профиль'}
              >
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
                              src={data.bannerUrl}
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
                        <span className={styles.avatarShell}>
                          <picture className={styles.avatarMedia}>
                            {data.avatarStaticUrl !== data.avatarUrl && (
                              <source
                                media="(prefers-reduced-motion: reduce)"
                                srcSet={data.avatarStaticUrl}
                              />
                            )}
                            <img
                              src={data.avatarUrl}
                              alt=""
                              width={72}
                              height={72}
                              loading="eager"
                              decoding="async"
                              style={premiumMediaStyle(data.avatarTransform)}
                            />
                          </picture>
                        </span>

                        <div className={styles.identityCopy}>
                          <span className={styles.kicker}>AnimeBox profile</span>
                          <span className={styles.nameLine}>
                            <UserIdentity
                              username={data.username}
                              role={data.role}
                              sponsor={data.sponsor}
                              compact
                            />
                            {data.premium && (
                              <span className={styles.premiumBadge}>Premium</span>
                            )}
                          </span>
                          <span className={styles.levelRow}>
                            <span className={styles.levelBadge}>LV.{data.progression.level}</span>
                            <span className={styles.rankLabel}>{data.progression.rank}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.body}>
                      {data.bio && <p className={styles.bio}>{data.bio}</p>}

                      <div className={styles.metaGrid}>
                        <div className={styles.metaCard}>
                          <span className={styles.metaIcon} aria-hidden="true">
                            <span className={styles.flameCrop}>
                              <img src="/brand/profile/streak-fire.webp" alt="" />
                            </span>
                          </span>
                          <span>
                            <small>Серия активности</small>
                            <strong>{data.streak.current} дн.</strong>
                            <em>рекорд {data.streak.longest}</em>
                          </span>
                        </div>

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
