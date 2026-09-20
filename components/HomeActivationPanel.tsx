'use client';

import Link from 'next/link';

import { useAuthModal } from '@/components/AuthModalProvider';
import { useAuthState } from '@/components/AuthStateProvider';
import { trackProductClientEvent } from '@/lib/product-events-client';

function track(action: string) {
  trackProductClientEvent('personal_home_activation', {
    source: 'home',
    path: '/',
    metadata: { action },
  });
}

export default function HomeActivationPanel({
  hasHistory,
  hasContinue,
}: {
  hasHistory: boolean;
  hasContinue: boolean;
}) {
  const { user, profile, loading } = useAuthState();
  const { openAuth } = useAuthModal();

  if (loading || (user && (hasHistory || hasContinue))) return null;

  if (!user) {
    return (
      <section className="home-activation-v2 home-activation-v2--guest" aria-label="Войти в AnimeBox">
        <div>
          <span className="home-activation-v2__eyebrow">ТВОЙ ANIMEBOX</span>
          <h2>Сохрани прогресс, не покидая эту страницу</h2>
          <p>Вход откроется поверх AnimeBox. После авторизации ты останешься здесь же.</p>
        </div>
        <div className="home-activation-v2__actions">
          <button
            type="button"
            onClick={() => {
              track('open_auth');
              openAuth({ mode: 'login', intent: 'account', next: '/' });
            }}
          >
            Войти
          </button>
          <button
            type="button"
            className="is-secondary"
            onClick={() => {
              track('open_register');
              openAuth({ mode: 'register', intent: 'account', next: '/' });
            }}
          >
            Создать аккаунт
          </button>
        </div>
      </section>
    );
  }

  const username = profile?.username?.trim() || 'пользователь';

  return (
    <section className="home-activation-v2" aria-label="Настроить персональный AnimeBox">
      <div className="home-activation-v2__intro">
        <span className="home-activation-v2__eyebrow">ПЕРСОНАЛЬНАЯ ГЛАВНАЯ</span>
        <h2>{username}, настроим AnimeBox за минуту</h2>
        <p>Пара действий даст рекомендации больше сигналов и заполнит твою главную.</p>
      </div>

      <div className="home-activation-v2__steps">
        <Link href="/search" onClick={() => track('discover_anime')}>
          <span>01</span>
          <div><strong>Найди первое аниме</strong><small>Каталог, поиск и рекомендации</small></div>
          <b>→</b>
        </Link>
        <Link href="/list" onClick={() => track('open_tracker')}>
          <span>02</span>
          <div><strong>Добавь в трекер</strong><small>Watching / Planned / Completed</small></div>
          <b>→</b>
        </Link>
        <a href="#animebox-for-you" onClick={() => track('open_recommendations')}>
          <span>03</span>
          <div><strong>Выбери настроение</strong><small>Подстроим ленту «Для тебя»</small></div>
          <b>↓</b>
        </a>
      </div>
    </section>
  );
}
