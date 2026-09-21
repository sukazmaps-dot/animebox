'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { trackProductClientEvent } from '@/lib/product-events-client';

import styles from './WatchPartyFriendInvite.module.css';

type FriendCard = {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  direction: 'friend';
};

type FriendsResponse = {
  friends?: FriendCard[];
  error?: string;
};

type AnchorState = {
  left: number;
  top: number;
  placement: 'above' | 'below';
};

const DESKTOP_POPOVER_WIDTH = 320;
const VIEWPORT_GUTTER = 12;

export default function WatchPartyFriendInvite({
  inviteUrl,
  animeTitle,
  episode,
}: {
  inviteUrl: string;
  animeTitle: string;
  episode: number;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches,
  );
  const [anchor, setAnchor] = useState<AnchorState>({
    left: VIEWPORT_GUTTER,
    top: VIEWPORT_GUTTER,
    placement: 'above',
  });
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const sync = () => setIsMobile(media.matches);
    media.addEventListener('change', sync);

    return () => media.removeEventListener('change', sync);
  }, []);

  const updateAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      DESKTOP_POPOVER_WIDTH,
      Math.max(220, window.innerWidth - VIEWPORT_GUTTER * 2),
    );
    const maxLeft = Math.max(
      VIEWPORT_GUTTER,
      window.innerWidth - width - VIEWPORT_GUTTER,
    );
    const left = Math.min(
      Math.max(VIEWPORT_GUTTER, rect.right - width),
      maxLeft,
    );

    setAnchor({
      left,
      top: rect.top >= 340 ? rect.top - 8 : rect.bottom + 8,
      placement: rect.top >= 340 ? 'above' : 'below',
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError('');
  }, []);

  useEffect(() => {
    if (!open) return;

    updateAnchor();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [close, open, updateAnchor]);

  useEffect(() => {
    if (!open || friends.length) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      void fetch('/api/friends', { cache: 'no-store' })
        .then(async (response) => {
          const payload = (await response.json()) as FriendsResponse;
          if (!response.ok) {
            throw new Error(payload.error || 'Не удалось загрузить друзей.');
          }
          if (!active) return;
          setFriends(payload.friends ?? []);
          setError('');
        })
        .catch((requestError) => {
          if (!active) return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось загрузить друзей.',
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
    };
  }, [friends.length, open]);

  async function invite(friend: FriendCard) {
    if (busyId || sent.has(friend.userId)) return;
    setBusyId(friend.userId);
    setError('');

    try {
      const response = await fetch('/api/friends/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: friend.userId,
          inviteUrl,
          animeTitle,
          episode,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось отправить приглашение.');
      }

      setSent((current) => new Set(current).add(friend.userId));
      trackProductClientEvent('watch_party_invite_shared', {
        source: 'watch_party',
        entityType: 'friend',
        entityId: friend.userId,
        metadata: {
          method: 'friend_notification',
          anime_title: animeTitle,
          episode,
        },
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось отправить приглашение.',
      );
    } finally {
      setBusyId(null);
    }
  }

  const desktopStyle = {
    left: anchor.left,
    top: anchor.top,
  } satisfies CSSProperties;

  const dialog =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={styles.backdrop}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <section
              className={[
                styles.sheet,
                isMobile ? styles.mobile : styles.desktop,
                !isMobile && anchor.placement === 'above'
                  ? styles.above
                  : styles.below,
              ]
                .filter(Boolean)
                .join(' ')}
              style={isMobile ? undefined : desktopStyle}
              role="dialog"
              aria-modal="true"
              aria-label="Пригласить друзей в комнату"
            >
              <header className={styles.header}>
                <div className={styles.headerCopy}>
                  <strong>Пригласить друзей</strong>
                  <span>Уведомление появится прямо в AnimeBox</span>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={close}
                  aria-label="Закрыть список друзей"
                >
                  ×
                </button>
              </header>

              <div className={styles.body}>
                {loading ? (
                  <div className={styles.loading}>Загружаем друзей…</div>
                ) : friends.length ? (
                  <div className={styles.list}>
                    {friends.map((friend) => {
                      const wasSent = sent.has(friend.userId);
                      return (
                        <div key={friend.userId} className={styles.friend}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className={styles.avatar}
                            src={friend.avatarUrl}
                            alt=""
                          />
                          <span className={styles.name}>{friend.username}</span>
                          <button
                            type="button"
                            disabled={wasSent || busyId === friend.userId}
                            onClick={() => void invite(friend)}
                            className={styles.invite}
                          >
                            {wasSent
                              ? 'Отправлено ✓'
                              : busyId === friend.userId
                                ? '…'
                                : 'Позвать'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <p>Сначала добавь друзей в AnimeBox.</p>
                    <Link href="/friends" onClick={close}>
                      Открыть друзей →
                    </Link>
                  </div>
                )}
              </div>

              {error && (
                <p className={styles.error} role="status">
                  {error}
                </p>
              )}
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setOpen((current) => !current);
        }}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Друзья
      </button>
      {dialog}
    </div>
  );
}
