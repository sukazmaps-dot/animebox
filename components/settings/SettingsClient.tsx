'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import Icon from '@/components/Icon';
import { useAuthState } from '@/components/AuthStateProvider';
import { createClient } from '@/lib/supabase/client';
import { premiumMediaStyle } from '@/lib/premium-studio';
import {
  DEFAULT_USER_PREFERENCES,
  readUserPreferences,
  resetUserPreferences,
  writeUserPreferences,
  type UserPreferences,
  type UserThemePreference,
} from '@/lib/user-preferences';

import styles from './SettingsClient.module.css';

type NotificationSettingsResponse = {
  ok?: boolean;
  telegramLinked?: boolean;
  telegramEnabled?: boolean;
  error?: string;
  message?: string;
};

const LAST_WATCH_PARTY_ROOM_KEY = 'animebox:watch-together:last-room:v1';

const THEME_OPTIONS: Array<{
  value: UserThemePreference;
  label: string;
  description: string;
}> = [
  { value: 'dark', label: 'Тёмная', description: 'Фирменная AnimeBox' },
  { value: 'light', label: 'Светлая', description: 'Мягкий светлый интерфейс' },
  { value: 'system', label: 'Системная', description: 'Как на устройстве' },
];


async function requestTelegramWriteAccess() {
  const telegram = window.Telegram?.WebApp;
  if (!telegram?.initData) return true;
  if (telegram.initDataUnsafe.user?.allows_write_to_pm === true) return true;
  if (typeof telegram.requestWriteAccess !== 'function') return true;

  return await new Promise<boolean>((resolve) => {
    telegram.requestWriteAccess?.((allowed) => resolve(Boolean(allowed)));
  });
}

function Toggle({
  checked,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      data-on={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={onChange}
      aria-pressed={checked}
      aria-label={label}
    >
      <span />
    </button>
  );
}

export default function SettingsClient() {
  const {
    user,
    profile,
    loading: authLoading,
    signOut,
  } = useAuthState();
  const supabase = useMemo(() => createClient(), []);

  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [hasLastRoom, setHasLastRoom] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreferences(readUserPreferences());
      try {
        setHasLastRoom(Boolean(window.localStorage.getItem(LAST_WATCH_PARTY_ROOM_KEY)));
      } catch {
        setHasLastRoom(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.replace('/login?next=%2Fsettings');
      return;
    }

    let active = true;
    const controller = new AbortController();

    void fetch('/api/notifications/settings', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as NotificationSettingsResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || 'Не удалось загрузить настройки уведомлений.');
        }
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setTelegramLinked(Boolean(payload.telegramLinked));
        setTelegramEnabled(Boolean(payload.telegramEnabled));
      })
      .catch((error) => {
        if (!active || (error as Error).name === 'AbortError') return;
        setMessage(error instanceof Error ? error.message : 'Не удалось загрузить уведомления.');
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [authLoading, user]);

  const displayAvatarPath = profile?.display_avatar_path || profile?.avatar_path;
  const avatarUrl = displayAvatarPath
    ? supabase.storage.from('profile-media').getPublicUrl(displayAvatarPath).data.publicUrl
    : '/default-avatar.webp';
  const username = profile?.username?.trim() || user?.email?.split('@')[0] || 'Пользователь';

  function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const next = writeUserPreferences({ ...preferences, [key]: value });
    setPreferences(next);
    setMessage('Настройка сохранена.');
    window.setTimeout(() => setMessage(''), 1600);
  }

  async function toggleTelegram() {
    if (notificationBusy || notificationLoading || !telegramLinked) return;
    setNotificationBusy(true);
    setMessage('');

    try {
      const next = !telegramEnabled;

      if (next) {
        const allowed = await requestTelegramWriteAccess();
        if (!allowed) {
          throw new Error('Telegram не дал разрешение на сообщения от AnimeBox.');
        }
      }

      const response = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ telegramEnabled: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as NotificationSettingsResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Не удалось обновить Telegram-уведомления.');
      }

      setTelegramEnabled(next);
      setMessage(next ? 'Telegram-уведомления включены.' : 'Telegram-уведомления выключены.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обновить уведомления.');
    } finally {
      setNotificationBusy(false);
    }
  }

  function clearLastRoom() {
    try {
      window.localStorage.removeItem(LAST_WATCH_PARTY_ROOM_KEY);
    } catch {
      // Ignore storage failures.
    }
    setHasLastRoom(false);
    setMessage('Последняя Watch Together комната забыта.');
  }

  function resetLocalSettings() {
    const next = resetUserPreferences();
    setPreferences(next);
    clearLastRoom();
    setMessage('Локальные настройки AnimeBox сброшены.');
  }

  async function logout() {
    await signOut();
    window.location.replace('/');
  }

  if (authLoading || !user) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>Загружаем настройки…</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div>
          <span className={styles.eyebrow}>ANIMEBOX SETTINGS</span>
          <h1>Настройки</h1>
          <p>Управляй просмотром, уведомлениями и аккаунтом в одном месте.</p>
        </div>

        <div className={styles.accountChip}>
          <span className={styles.avatar}>
            <img
              src={avatarUrl}
              alt=""
              style={premiumMediaStyle(profile?.display_avatar_transform)}
            />
          </span>
          <span>
            <strong>{username}</strong>
            <small>{user.email || 'AnimeBox аккаунт'}</small>
          </span>
        </div>
      </section>

      {message && <div className={styles.toast} role="status">{message}</div>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="play" /></span>
            <div><small>ПРОСМОТР</small><h2>Плеер</h2></div>
          </div>

          <div className={styles.settingRow}>
            <div>
              <strong>Следующая серия автоматически</strong>
              <p>После окончания серии AnimeBox сам откроет следующую, если она доступна.</p>
            </div>
            <Toggle
              checked={preferences.autoNextEpisode}
              onChange={() => updatePreference('autoNextEpisode', !preferences.autoNextEpisode)}
              label="Автопереход к следующей серии"
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="spark" /></span>
            <div><small>ИНТЕРФЕЙС</small><h2>Комфорт</h2></div>
          </div>

          <div className={styles.themeRow}>
            <div>
              <strong>Тема AnimeBox</strong>
              <p>Выбери тёмную, светлую или синхронизацию с настройкой устройства.</p>
            </div>

            <div className={styles.themeChoices} role="group" aria-label="Тема интерфейса">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.themeChoice}
                  data-active={preferences.theme === option.value ? 'true' : 'false'}
                  aria-pressed={preferences.theme === option.value}
                  onClick={() => updatePreference('theme', option.value)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.settingRow}>
            <div>
              <strong>Уменьшить анимации</strong>
              <p>Сокращает декоративные переходы и движения интерфейса, не затрагивая видео.</p>
            </div>
            <Toggle
              checked={preferences.reduceMotion}
              onChange={() => updatePreference('reduceMotion', !preferences.reduceMotion)}
              label="Уменьшить анимации"
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="bell" /></span>
            <div><small>УВЕДОМЛЕНИЯ</small><h2>Telegram</h2></div>
          </div>

          <div className={styles.settingRow}>
            <div>
              <strong>Уведомления о новых сериях</strong>
              <p>
                {telegramLinked
                  ? 'Главный переключатель Telegram-уведомлений AnimeBox.'
                  : 'Telegram ещё не привязан к этому аккаунту.'}
              </p>
            </div>
            <Toggle
              checked={telegramEnabled}
              disabled={notificationLoading || notificationBusy || !telegramLinked}
              onChange={() => void toggleTelegram()}
              label="Telegram-уведомления"
            />
          </div>

          <Link href="/notifications" className={styles.inlineLink}>
            Управление подписками на тайтлы <Icon name="chevron" />
          </Link>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="user" /></span>
            <div><small>ПРОФИЛЬ</small><h2>Оформление аккаунта</h2></div>
          </div>

          <div className={styles.linkGrid}>
            <Link href="/profile"><strong>Мой профиль</strong><small>Публичная страница и статистика</small></Link>
            <Link href="/profile/edit"><strong>Редактировать профиль</strong><small>Ник, аватар и баннер</small></Link>
            <Link href="/profile/studio"><strong>Profile Studio</strong><small>Premium-оформление профиля</small></Link>
            <Link href="/settings/sponsor"><strong>Спонсорское оформление</strong><small>Рамка, ник и приватность</small></Link>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="star" /></span>
            <div><small>ПОДПИСКА</small><h2>Premium</h2></div>
          </div>

          <p className={styles.cardCopy}>
            Управляй AnimeBox Premium, оформлением профиля и статусом подписки.
          </p>
          <div className={styles.actionRow}>
            <Link href="/premium" className={styles.primaryAction}>AnimeBox Premium</Link>
            <Link href="/support" className={styles.secondaryAction}>Поддержать проект</Link>
          </div>
        </section>

        <section className={`${styles.card} ${styles.dangerCard}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon}><Icon name="menu" /></span>
            <div><small>ЛОКАЛЬНЫЕ ДАННЫЕ</small><h2>Сброс и выход</h2></div>
          </div>

          <div className={styles.dangerRows}>
            <div>
              <span><strong>Последняя Watch Together комната</strong><small>{hasLastRoom ? 'Сохранена на этом устройстве' : 'Нет сохранённой комнаты'}</small></span>
              <button type="button" disabled={!hasLastRoom} onClick={clearLastRoom}>Забыть</button>
            </div>
            <div>
              <span><strong>Локальные настройки</strong><small>Вернуть настройки интерфейса и просмотра по умолчанию</small></span>
              <button type="button" onClick={resetLocalSettings}>Сбросить</button>
            </div>
            <div>
              <span><strong>Выйти из аккаунта</strong><small>Сессия AnimeBox на этом устройстве будет завершена</small></span>
              <button type="button" className={styles.logoutButton} onClick={() => void logout()}>Выйти</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
