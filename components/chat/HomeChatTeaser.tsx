'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { HomeChatTeaserMessage } from '@/types/chat';
import { premiumMediaStyle } from '@/lib/premium-studio';
import styles from './HomeChatTeaser.module.css';

function relativeTime(value: string) {
  const diff = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} д`;
}

function badgeFor(message: HomeChatTeaserMessage) {
  if (message.author?.role === 'owner') return 'Владелец';
  if (message.author?.role === 'admin') return 'Админ';
  if (message.author?.role === 'moderator') return 'Мод';
  if (message.author?.sponsor?.tier === 'patron') return 'Меценат';
  if (message.author?.premium) return 'Premium';
  if (message.author?.sponsor) return 'Спонсор';
  return null;
}

export default function HomeChatTeaser() {
  const [messages, setMessages] = useState<HomeChatTeaserMessage[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const run = () => {
      void fetch('/api/chat/teaser', { signal: controller.signal, cache: 'default' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('chat teaser'))))
        .then((data: { messages?: HomeChatTeaserMessage[] }) => {
          if (!controller.signal.aborted && Array.isArray(data.messages)) setMessages(data.messages);
        })
        .catch((error) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            console.debug('[Chat teaser] unavailable');
          }
        });
    };

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      run();
    };

    const timer = window.setTimeout(start, 6_000);
    window.addEventListener('pointerdown', start, { once: true, passive: true });
    window.addEventListener('wheel', start, { once: true, passive: true });
    window.addEventListener('keydown', start, { once: true });

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('wheel', start);
      window.removeEventListener('keydown', start);
    };
  }, []);
  return (
    <section className={styles.card} aria-labelledby="home-chat-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>ANIMEBOX COMMUNITY</span>
          <h2 id="home-chat-title">Общий чат</h2>
          <p>Обсуждай серии, находи людей и показывай свой статус.</p>
        </div>
        <Link href="/chat" className={styles.openLink}>
          Открыть чат <span aria-hidden="true">→</span>
        </Link>
      </div>

      {messages.length ? (
        <div className={styles.messages}>
          {messages.map((message) => {
            const badge = badgeFor(message);
            return (
              <Link key={message.id} href="/chat" className={styles.message}>
                <img
                  src={message.author?.avatarUrl || '/default-avatar.webp'}
                  alt=""
                  className={styles.avatar}
                  loading="lazy"
                  style={premiumMediaStyle(message.author?.avatarTransform)}
                />
                <span className={styles.copy}>
                  <span className={styles.meta}>
                    <strong>{message.author?.username || 'Пользователь'}</strong>
                    {badge && <em>{badge}</em>}
                    <small>{relativeTime(message.created_at)}</small>
                  </span>
                  <span className={styles.body}>
                    {message.deleted_at ? 'Сообщение удалено.' : message.body}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <Link href="/chat" className={styles.empty}>
          <span className={styles.emptyIcon}>✦</span>
          <span>
            <strong>Чат уже открыт</strong>
            <small>Зайди первым и начни разговор.</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className={styles.footer}>
        <span className={styles.liveDot} aria-hidden="true" />
        Читать можно без аккаунта. Чтобы писать — достаточно войти.
      </div>
    </section>
  );
}
