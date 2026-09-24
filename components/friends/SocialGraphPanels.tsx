'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import FriendActionButton from '@/components/friends/FriendActionButton';
import ProfilePreview from '@/components/profile/ProfilePreview';

import styles from './SocialGraphPanels.module.css';

type DiscoveryPerson = {
  userId: string;
  username: string;
  avatarUrl: string;
  friendshipState:
    | 'none'
    | 'pending_incoming'
    | 'pending_outgoing'
    | 'accepted';
  friendshipId: string | null;
  online: boolean;
};

type ActivityItem = {
  id: string;
  type: 'completed' | 'commented' | 'rated';
  createdAt: string;
  actor: {
    userId: string;
    username: string;
    avatarUrl: string;
    online: boolean;
  };
  anime: {
    id: number;
    title: string;
    slug: string | null;
    posterUrl: string | null;
  } | null;
  episode: number | null;
  score: number | null;
  href: string;
};

type Privacy = {
  showOnlineToFriends: boolean;
  showActivityToFriends: boolean;
};

function relativeTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '';

  const minutes = Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return String(minutes) + ' мин';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return String(hours) + ' ч';
  return String(Math.floor(hours / 24)) + ' дн';
}

function activityCopy(item: ActivityItem) {
  const title = item.anime?.title ?? 'аниме';

  if (item.type === 'completed') {
    return item.episode
      ? 'досмотрел серию ' + item.episode + ' · ' + title
      : 'завершил просмотр · ' + title;
  }

  if (item.type === 'rated') {
    return item.score
      ? 'поставил ' + item.score + '/10 · ' + title
      : 'оценил · ' + title;
  }

  return item.episode
    ? 'обсудил серию ' + item.episode + ' · ' + title
    : 'оставил комментарий · ' + title;
}

export default function SocialGraphPanels() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<DiscoveryPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [privacy, setPrivacy] = useState<Privacy>({
    showOnlineToFriends: true,
    showActivityToFriends: true,
  });
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [error, setError] = useState('');

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const response = await fetch('/api/friends/activity?limit=20', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        activity?: ActivityItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось загрузить активность.');
      }
      setActivity(payload.activity ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить активность.',
      );
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.all([
      fetch('/api/social/privacy', { cache: 'no-store' })
        .then(async (response) => {
          const payload = (await response.json()) as {
            privacy?: Privacy;
          };
          if (active && response.ok && payload.privacy) {
            setPrivacy(payload.privacy);
          }
        })
        .catch(() => undefined),
      loadActivity(),
    ]);

    return () => {
      active = false;
    };
  }, [loadActivity]);

  useEffect(() => {
    const clean = query.trim();

    if (clean.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);

      void fetch('/api/friends/discover?q=' + encodeURIComponent(clean), {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            people?: DiscoveryPerson[];
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error || 'Не удалось найти пользователей.');
          }
          setPeople(payload.people ?? []);
          setError('');
        })
        .catch((requestError) => {
          if (
            requestError instanceof DOMException &&
            requestError.name === 'AbortError'
          ) {
            return;
          }
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось найти пользователей.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function updatePrivacy(key: keyof Privacy, value: boolean) {
    if (privacyBusy) return;

    const previous = privacy;
    const next = { ...privacy, [key]: value };
    setPrivacy(next);
    setPrivacyBusy(true);
    setError('');

    try {
      const response = await fetch('/api/social/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ [key]: value }),
      });
      const payload = (await response.json()) as {
        privacy?: Privacy;
        error?: string;
      };

      if (!response.ok || !payload.privacy) {
        throw new Error(payload.error || 'Не удалось сохранить настройку.');
      }

      setPrivacy(payload.privacy);
      await loadActivity();
    } catch (requestError) {
      setPrivacy(previous);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось сохранить настройку.',
      );
    } finally {
      setPrivacyBusy(false);
    }
  }

  const onlineCount = useMemo(
    () =>
      activity.reduce((users, item) => {
        if (item.actor.online) users.add(item.actor.userId);
        return users;
      }, new Set<string>()).size,
    [activity],
  );

  return (
    <section className={styles.grid}>
      <article className={styles.panel}>
        <div className={styles.head}>
          <div>
            <span>DISCOVERY</span>
            <h2>Найти своих</h2>
          </div>
          {searching && <small>ищем…</small>}
        </div>

        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ник пользователя…"
            maxLength={24}
            autoComplete="off"
          />
        </label>

        <div className={styles.people}>
          {query.trim().length < 2 ? (
            <p className={styles.empty}>
              Введи хотя бы 2 символа. Поиск работает по никам AnimeBox.
            </p>
          ) : !searching && people.length === 0 ? (
            <p className={styles.empty}>Никого не нашли.</p>
          ) : (
            people.map((person) => (
              <div className={styles.person} key={person.userId}>
                <ProfilePreview
                  userId={person.userId}
                  username={person.username}
                >
                  <span className={styles.avatarWrap}>
                    <img src={person.avatarUrl} alt="" />
                    {person.online && (
                      <span className={styles.onlineDot} title="В сети" />
                    )}
                  </span>
                </ProfilePreview>

                <div className={styles.personCopy}>
                  <ProfilePreview
                    userId={person.userId}
                    username={person.username}
                  >
                    <strong>{person.username}</strong>
                  </ProfilePreview>
                  <small>
                    {person.online
                      ? 'В сети'
                      : person.friendshipState === 'accepted'
                        ? 'В друзьях'
                        : 'Пользователь AnimeBox'}
                  </small>
                </div>

                <FriendActionButton
                  targetUserId={person.userId}
                  variant="profile-preview"
                />
              </div>
            ))
          )}
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.head}>
          <div>
            <span>FRIEND ACTIVITY</span>
            <h2>Что смотрят друзья</h2>
          </div>
          <small>{onlineCount > 0 ? String(onlineCount) + ' онлайн' : 'твой круг'}</small>
        </div>

        <div className={styles.activity}>
          {activityLoading ? (
            <p className={styles.empty}>Загружаем активность…</p>
          ) : activity.length === 0 ? (
            <p className={styles.empty}>
              Здесь появятся завершённые серии, оценки и обсуждения друзей.
            </p>
          ) : (
            activity.map((item) => (
              <Link className={styles.activityRow} href={item.href} key={item.id}>
                <span className={styles.avatarWrap}>
                  <img src={item.actor.avatarUrl} alt="" />
                  {item.actor.online && (
                    <span className={styles.onlineDot} title="В сети" />
                  )}
                </span>
                <span className={styles.activityCopy}>
                  <strong>{item.actor.username}</strong>
                  <span>{activityCopy(item)}</span>
                </span>
                <time>{relativeTime(item.createdAt)}</time>
              </Link>
            ))
          )}
        </div>

        <div className={styles.privacy}>
          <div>
            <strong>Социальная видимость</strong>
            <small>Только для подтверждённых друзей.</small>
          </div>

          <label>
            <input
              type="checkbox"
              checked={privacy.showOnlineToFriends}
              disabled={privacyBusy}
              onChange={(event) =>
                void updatePrivacy(
                  'showOnlineToFriends',
                  event.target.checked,
                )
              }
            />
            <span>Показывать, когда я онлайн</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={privacy.showActivityToFriends}
              disabled={privacyBusy}
              onChange={(event) =>
                void updatePrivacy(
                  'showActivityToFriends',
                  event.target.checked,
                )
              }
            />
            <span>Показывать мою активность</span>
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </article>
    </section>
  );
}
