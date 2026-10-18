'use client';

import { useAuthState } from '@/components/AuthStateProvider';
import { useAuthModal } from '@/components/AuthModalProvider';
import styles from './HomeGuestPrompt.module.css';

/** Lightweight conversion surface. Guest watch history remains managed by HomeFeedRuntimeProvider. */
export default function HomeGuestPrompt() {
  const { user, loading } = useAuthState();
  const { openAuth } = useAuthModal();
  if (loading || user) return null;
  return (
    <aside className={styles.root} aria-label="Сохрани свой прогресс">
      <p>Войди, чтобы продолжить с того места, где остановился, на любом устройстве.</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => openAuth({ mode: 'login', intent: 'account', next: '/' })}>Войти</button>
        <button type="button" onClick={() => openAuth({ mode: 'register', intent: 'account', next: '/' })}>Создать аккаунт</button>
      </div>
    </aside>
  );
}
