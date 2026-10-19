'use client';

import { useRef, useState } from 'react';
import { useAuthState } from '@/components/AuthStateProvider';
import { useAuthModal } from '@/components/AuthModalProvider';
import { communityRequest } from '@/lib/community-client';
import styles from './HomeTonightPick.module.css';

function BookmarkAction({ animeId, userId, loading }: { animeId: number; userId?: string; loading: boolean }) {
  const { openAuth } = useAuthModal();
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pending = useRef(false);
  const label = state === 'saved' ? 'Добавлено в список' : state === 'saving'
    ? 'Добавляем в список…' : state === 'error' ? 'Повторить добавление в список' : 'Добавить в список';
  return <>
    <button className={styles.bookmark} type="button" aria-label={label} title={label}
      aria-pressed={state === 'saved'} disabled={loading || state === 'saving' || state === 'saved'}
      onClick={async () => {
        if (!userId) { openAuth({ mode: 'login', intent: 'account', next: '/' }); return; }
        if (pending.current || state === 'saved') return;
        pending.current = true;
        setState('saving');
        try {
          await communityRequest('library', { animeId, status: 'planned' });
          setState('saved');
          window.dispatchEvent(new Event('library-updated'));
        } catch { setState('error'); }
        finally { pending.current = false; }
      }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={state === 'saved' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3.5h12v17l-6-4-6 4z" />
      </svg>
    </button>
    {state === 'error' && <span className={styles.saveError} role="status">Не удалось добавить. Повтори попытку.</span>}
  </>;
}

/** Keying isolates pending saves and saved state across choices and accounts. */
export default function HomeHeroBookmark({ animeId }: { animeId: number }) {
  const { user, loading } = useAuthState();
  return <BookmarkAction key={`${animeId}:${user?.id ?? 'guest'}`} animeId={animeId} userId={user?.id} loading={loading} />;
}
