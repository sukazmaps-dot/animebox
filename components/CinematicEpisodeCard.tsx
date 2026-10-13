import Link from 'next/link';
import AnimeImageCascade from '@/components/AnimeImageCascade';
import type { EpisodePresentation } from '@/types/episode-availability';
import styles from './CinematicEpisodeList.module.css';

export default function CinematicEpisodeCard({ slug, number, detail, percent, current, completed, positionMs }: {
  slug: string;
  number: number;
  detail?: EpisodePresentation;
  percent: number;
  current: boolean;
  completed: boolean;
  positionMs?: number;
}) {
  const status = current ? 'Сейчас' : completed ? 'Просмотрено' : percent > 0 ? `${percent}% просмотрено` : '';
  const resumeSeconds = Math.floor((positionMs || 0) / 1000);
  return (
    <Link href={`/anime/${slug}/episode/${number}`} prefetch={false} role="listitem"
      className={`${styles.card} ${detail?.thumbnailUrl ? styles.media : ''} ${current ? styles.current : ''} ${completed ? styles.completed : ''}`}
      aria-current={current ? 'page' : undefined}
      aria-label={`Серия ${number}${detail?.title ? `: ${detail.title}` : ''}${status ? `, ${status}` : ''}`}
      data-episode-current={current ? 'true' : undefined}
      data-episode-state={current ? 'current' : completed ? 'completed' : percent > 0 ? 'partial' : 'unwatched'}>
      <span className={`${styles.visual} ${detail?.thumbnailUrl ? styles.thumbnail : ''}`} aria-hidden="true">
        {detail?.thumbnailUrl ? <AnimeImageCascade sources={[detail.thumbnailUrl]} alt="" loading="lazy"
          fetchPriority="low" preset="card" sizes="140px" /> : <span>{String(number).padStart(2, '0')}</span>}
        {percent > 0 && <span className={styles.progress}><i style={{ width: `${percent}%` }} /></span>}
      </span>
      <span className={styles.copy}>
        <span className={styles.title}>{detail?.title || `Серия ${number}`}</span>
        {detail?.title && <span className={styles.subtitle}>Эпизод {number}</span>}
        {detail?.description && <span className={styles.summary}>{detail.description}</span>}
        <span className={styles.status}>
          {status}
          {!completed && percent > 0 && resumeSeconds > 0 && ` · с ${Math.floor(resumeSeconds / 60)}:${String(resumeSeconds % 60).padStart(2, '0')}`}
          {detail?.durationSeconds != null && detail.durationSeconds > 0 && ` ${status ? '· ' : ''}${Math.round(detail.durationSeconds / 60)} мин`}
        </span>
      </span>
      <span className={styles.play} aria-hidden="true">
        {completed ? '✓' : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="m8 4 13 8-13 8z" /></svg>}
      </span>
    </Link>
  );
}
