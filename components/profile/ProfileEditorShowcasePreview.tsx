'use client';
import type { ProfileWidgetsData, ProfileWidgetKey } from '@/types/profile-widgets';
import styles from './ProfileEditorShowcasePreview.module.css';

const titles: Record<ProfileWidgetKey, string> = {
  favorites: 'Любимые аниме', watching: 'Смотрю сейчас', ratings: 'Мои оценки',
  genres: 'Любимые жанры', activity: 'Последняя активность',
};
type Props = {
  data: ProfileWidgetsData | null; loading: boolean; error: string;
  onConfigure: () => void; onRetry: () => void;
};
export default function ProfileEditorShowcasePreview({ data, loading, error, onConfigure, onRetry }: Props) {
  const visible = [...(data?.layout ?? [])].filter(item => item.visible).sort((a, b) => a.position - b.position);
  return (
    <section className={styles.board} aria-label="Предпросмотр витрины">
      <header className={styles.header}><h2>Доска профиля</h2><button type="button" onClick={onConfigure}>Настроить</button></header>
      {loading ? <p role="status">Загружаем витрину…</p> : error ? (
        <div className={styles.empty} role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Повторить</button></div>
      ) : !data || !visible.length ? (
        <div className={styles.empty}><strong>Твоя история аниме</strong><p>Добавь любимые тайтлы и выбери блоки, которые увидят в твоём профиле.</p><button type="button" onClick={onConfigure}>Настроить витрину</button></div>
      ) : visible.map(({ key }) => (
        <section className={styles.widget} key={key}>
          <h3>{titles[key]}</h3>
          {key === 'favorites' && (data.favorites.length ? <div className={styles.posters}>{data.favorites.slice(0, 8).map(item => (
            <div className={styles.poster} key={item.animeId}>
              {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <span className={styles.posterFallback} aria-hidden="true">▶</span>}
              <span>{item.title}</span>
            </div>
          ))}</div> : <p>Закрепи любимые тайтлы — они появятся здесь.</p>)}
          {key === 'watching' && (data.watching.length ? <ul className={styles.list}>{data.watching.slice(0, 3).map(item => <li key={item.animeId}><span>{item.title}</span><small>{item.totalEpisodes ? item.totalEpisodes+' сер.' : 'Смотрю'}</small></li>)}</ul> : <p>Сейчас нет тайтлов в статусе «Смотрю».</p>)}
          {key === 'ratings' && (data.ratings.length ? <ul className={styles.list}>{data.ratings.slice(0, 3).map(item => <li key={item.animeId}><span>{item.title}</span><strong>{item.score}/10</strong></li>)}</ul> : <p>Твои оценки появятся после первого оценённого тайтла.</p>)}
          {key === 'genres' && (data.genres.length ? <div className={styles.genres}>{data.genres.slice(0, 6).map(item => <span key={item.name}>{item.name}</span>)}</div> : <p>Жанры появятся по мере просмотра и оценок.</p>)}
          {key === 'activity' && (data.activity.length ? <ul className={styles.list}>{data.activity.slice(0, 3).map(item => <li key={item.id}><span>{item.title}</span><small>{item.label}</small></li>)}</ul> : <p>Здесь будет твоя последняя активность.</p>)}
        </section>
      ))}
    </section>
  );
}
