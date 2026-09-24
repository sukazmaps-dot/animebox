import Link from 'next/link';
import type { ReactNode } from 'react';

import type {
  ProfileActivityItem,
  ProfileAnimeWidgetItem,
  ProfileWidgetKey,
  ProfileWidgetsData,
} from '@/types/profile-widgets';

export const PROFILE_WIDGET_TITLES: Record<ProfileWidgetKey, string> = {
  favorites: 'Любимые аниме',
  watching: 'Смотрю сейчас',
  ratings: 'Мои оценки',
  genres: 'Anime DNA',
  activity: 'Последняя активность',
};

function animeHref(item: Pick<ProfileAnimeWidgetItem, 'animeId' | 'slug'>) {
  return `/anime/${item.slug || item.animeId}`;
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function Poster({
  item,
  className = '',
}: {
  item: Pick<ProfileAnimeWidgetItem, 'posterUrl' | 'title'>;
  className?: string;
}) {
  return (
    <span className={`profile-widget__poster ${className}`}>
      {item.posterUrl ? (
        <img src={item.posterUrl} alt="" loading="lazy" />
      ) : (
        <span className="profile-widget__poster-fallback" aria-hidden="true">
          <svg viewBox="0 0 40 40" focusable="false">
            <rect x="8" y="5" width="24" height="30" rx="6" />
            <path d="m17 14 10 6-10 6Z" />
          </svg>
        </span>
      )}
    </span>
  );
}

function EmptyWidget({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="profile-widget__empty">
      <span className="profile-widget__empty-mark" aria-hidden="true">
        <svg viewBox="0 0 52 52" focusable="false">
          <rect x="10" y="9" width="32" height="34" rx="9" />
          <path d="M18 20h16M18 27h11" />
          <path d="m31 31 7 4-7 4Z" />
        </svg>
      </span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function FavoritesWidget({ data }: { data: ProfileWidgetsData }) {
  if (!data.favorites.length) {
    return (
      <EmptyWidget
        title="Здесь появятся любимые"
        copy="Закрепи до шести тайтлов, которые лучше всего описывают твой вкус."
      />
    );
  }

  return (
    <div className="profile-widget__poster-grid profile-widget__poster-grid--favorites">
      {data.favorites.map((item) => (
        <Link
          className="profile-widget__anime-card"
          href={animeHref(item)}
          key={item.animeId}
          title={item.title}
        >
          <Poster item={item} />
          <span>{item.title}</span>
        </Link>
      ))}
    </div>
  );
}

function WatchingWidget({ data }: { data: ProfileWidgetsData }) {
  if (!data.watching.length) {
    return (
      <EmptyWidget
        title="Сейчас ничего не смотрится"
        copy="Добавь тайтл в статус «Смотрю» — он автоматически появится здесь."
      />
    );
  }

  return (
    <div className="profile-widget__watching-list">
      {data.watching.map((item) => (
        <Link
          className="profile-widget__watching-row"
          href={animeHref(item)}
          key={item.animeId}
        >
          <Poster item={item} />
          <span className="profile-widget__watching-copy">
            <strong>{item.title}</strong>
            <small>
              {item.totalEpisodes
                ? `В трекере · ${item.totalEpisodes} сер.`
                : 'В трекере · онгоинг'}
            </small>
          </span>
          <span className="profile-widget__arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

function RatingsWidget({ data }: { data: ProfileWidgetsData }) {
  if (!data.ratings.length) {
    return (
      <EmptyWidget
        title="Оценок пока нет"
        copy="Поставь первую оценку на странице аниме — лучшие тайтлы появятся в профиле."
      />
    );
  }

  return (
    <>
      <div className="profile-widget__rating-summary">
        <div>
          <span>Средняя</span>
          <strong>{data.ratingSummary.average?.toFixed(1) ?? '—'}</strong>
        </div>
        <div>
          <span>Оценено</span>
          <strong>{data.ratingSummary.count}</strong>
        </div>
      </div>

      <div className="profile-widget__rating-grid">
        {data.ratings.map((item) => (
          <Link
            className="profile-widget__rating-card"
            href={animeHref(item)}
            key={item.animeId}
            title={item.title}
          >
            <Poster item={item} />
            <span className="profile-widget__rating-score">{item.score}/10</span>
            <strong>{item.title}</strong>
          </Link>
        ))}
      </div>
    </>
  );
}

function GenresWidget({ data }: { data: ProfileWidgetsData }) {
  if (!data.genres.length) {
    return (
      <EmptyWidget
        title="Anime DNA ещё формируется"
        copy="Смотри, оценивай и добавляй любимые — AnimeBox соберёт профиль твоего вкуса."
      />
    );
  }

  const maxWeight = Math.max(...data.genres.map((item) => item.weight), 1);

  return (
    <div className="profile-widget__genre-list">
      {data.genres.map((item, index) => (
        <div className="profile-widget__genre" key={item.name}>
          <div>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.name}</strong>
            <small>{item.share}% сигнала вкуса</small>
          </div>
          <span className="profile-widget__genre-track" aria-hidden="true">
            <i style={{ width: `${Math.max(14, Math.round((item.weight / maxWeight) * 100))}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ item }: { item: ProfileActivityItem }) {
  return (
    <Link className="profile-widget__activity-row" href={`/anime/${item.slug || item.animeId}`}>
      <span className="profile-widget__activity-icon" data-kind={item.kind} aria-hidden="true">
        {item.kind === 'rating' ? '★' : '◇'}
      </span>
      <span className="profile-widget__activity-copy">
        <strong>{item.label}</strong>
        <span>{item.title}</span>
      </span>
      {item.value && <b>{item.value}</b>}
      <time dateTime={item.occurredAt}>{formatActivityDate(item.occurredAt)}</time>
    </Link>
  );
}

function ActivityWidget({ data }: { data: ProfileWidgetsData }) {
  if (!data.activity.length) {
    return (
      <EmptyWidget
        title="История только начинается"
        copy="Последние оценки и изменения трекера будут собираться здесь."
      />
    );
  }

  return (
    <div className="profile-widget__activity-list">
      {data.activity.map((item) => (
        <ActivityRow item={item} key={item.id} />
      ))}
    </div>
  );
}

function WidgetBody({
  widget,
  data,
}: {
  widget: ProfileWidgetKey;
  data: ProfileWidgetsData;
}) {
  if (widget === 'favorites') return <FavoritesWidget data={data} />;
  if (widget === 'watching') return <WatchingWidget data={data} />;
  if (widget === 'ratings') return <RatingsWidget data={data} />;
  if (widget === 'genres') return <GenresWidget data={data} />;
  return <ActivityWidget data={data} />;
}

export default function ProfileWidgetsShowcase({
  data,
  actions,
  publicView = false,
}: {
  data: ProfileWidgetsData;
  actions?: ReactNode;
  publicView?: boolean;
}) {
  const visible = [...data.layout]
    .filter((item) => item.visible)
    .sort((a, b) => a.position - b.position);

  if (!visible.length && !actions) return null;

  return (
    <section className="profile-widgets-shell" data-public={publicView ? 'true' : 'false'}>
      <div className="profile-widgets-shell__head">
        <div>
          <span className="profile-v2__eyebrow">PROFILE IDENTITY</span>
          <h2>{publicView ? 'Аниме-профиль' : 'Мой аниме-профиль'}</h2>
          <p>{publicView ? 'Любимые тайтлы, оценки и профиль вкуса пользователя.' : 'Любимые тайтлы, оценки и вкус — в одной персональной витрине.'}</p>
        </div>
        {actions}
      </div>

      {visible.length ? (
        <div className="profile-widgets-grid">
          {visible.map((item) => (
            <article
              className="profile-widget"
              data-widget={item.key}
              key={item.key}
            >
              <div className="profile-widget__head">
                <span>{PROFILE_WIDGET_TITLES[item.key]}</span>
                <small>
                  {item.key === 'favorites' && 'выбор пользователя'}
                  {item.key === 'watching' && 'из трекера'}
                  {item.key === 'ratings' && 'AnimeBox score'}
                  {item.key === 'genres' && 'по активности'}
                  {item.key === 'activity' && 'последние события'}
                </small>
              </div>
              <WidgetBody widget={item.key} data={data} />
            </article>
          ))}
        </div>
      ) : (
        <div className="profile-widgets-shell__all-hidden">
          Все профильные виджеты скрыты. Их можно вернуть через настройку профиля.
        </div>
      )}
    </section>
  );
}
