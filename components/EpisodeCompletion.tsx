'use client';
import { useEffect, useState } from 'react';
import { communityRequest } from '@/lib/community-client';
export default function EpisodeCompletion({ animeId, episode }: { animeId: number; episode: number }) {
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () => communityRequest<{ episodes: number[] }>(`episodes?animeId=${animeId}`).then(data => {
      if (active) setCompleted(data.episodes.includes(episode));
    }).catch(() => {});
    void refresh(); window.addEventListener('episode-completed', refresh);
    return () => { active = false; window.removeEventListener('episode-completed', refresh); };
  }, [animeId, episode]);
  return <section className="community-panel community-completion">
    <div><strong>Серия {episode}: {completed ? 'просмотрена' : 'не отмечена'}</strong>
    <p>Подтверди просмотр этой серии. Пропущенные серии не засчитываются.</p></div>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setMessage('');
      try {
        await communityRequest('episodes', { animeId, episode, completed: !completed, source: 'manual' });
        setCompleted(!completed); window.dispatchEvent(new Event('episode-completed'));
      } catch (error) { setMessage((error as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? 'Сохраняем…' : completed ? 'Снять отметку' : 'Я посмотрел эту серию'}</button>
    <p role="status">{message}</p>
  </section>;
}
