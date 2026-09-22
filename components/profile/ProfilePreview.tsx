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
  bannerUrl: string | null;
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
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(
    () => previewCache.get(userId)?.data ?? null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });

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

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cardWidth = Math.min(360, window.innerWidth - 24);
      const estimatedHeight = 430;
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - cardWidth - 12),
      );
      const below = rect.bottom + 9;
      const top =
        below + estimatedHeight <= window.innerHeight - 12
          ? below
          : Math.max(12, rect.top - estimatedHeight - 9);

      setPosition({ top, left });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', onKeyDown);
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
        onClick={() => setOpen(true)}
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
                className={styles.card}
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
                    <div className={styles.banner}>
                      {data.bannerUrl ? (
                        <img
                          src={data.bannerUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={premiumMediaStyle(data.bannerTransform)}
                        />
                      ) : (
                        <img
                          src="/brand/profile-banner-default.webp"
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>

                    <div className={styles.body}>
                      <div className={styles.identity}>
                        <span className={styles.avatarShell}>
                          <img
                            src={data.avatarUrl}
                            alt=""
                            width={72}
                            height={72}
                            loading="lazy"
                            decoding="async"
                            style={premiumMediaStyle(data.avatarTransform)}
                          />
                        </span>

                        <div className={styles.identityCopy}>
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
                          <span className={styles.level}>
                            LV.{data.progression.level} · {data.progression.rank}
                          </span>
                        </div>
                      </div>

                      {data.bio && <p className={styles.bio}>{data.bio}</p>}

                      <div className={styles.meta}>
                        <span className={styles.streak}>
                          <img src="/brand/profile/streak-fire.webp" alt="" aria-hidden="true" />
                          <b>{data.streak.current}</b>
                          <span>дн. серия</span>
                        </span>
                        <span>В AnimeBox с {joinedLabel(data.createdAt)}</span>
                      </div>

                      <div className={styles.actions}>
                        <FriendActionButton targetUserId={data.id} />
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
            document.body,
          )
        : null}
    </>
  );
}
