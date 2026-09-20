import styles from './ProfileAnimeIdentity.module.css';

export type AnimeIdentityStats = {
  episodes: number;
  titles: number;
  activeMs: number;
  comments: number;
  watching?: number;
  planned?: number;
  completed?: number;
  dropped?: number;
  shonenTitles?: number;
  romanceTitles?: number;
  actionTitles?: number;
  fantasyTitles?: number;
  comedyTitles?: number;
  longestStreak?: number;
};

type Props = {
  stats: AnimeIdentityStats;
  level?: number;
  rank?: string;
  premium?: boolean;
  foundingNumber?: number | null;
};

const genreNames = [
  ['fantasyTitles', 'Фэнтези'],
  ['actionTitles', 'Экшен'],
  ['romanceTitles', 'Романтика'],
  ['comedyTitles', 'Комедия'],
  ['shonenTitles', 'Сёнэн'],
] as const;

function identityFor(stats: AnimeIdentityStats) {
  const genres = genreNames
    .map(([key, label]) => ({
      key,
      label,
      value: Math.max(0, Number(stats[key] ?? 0)),
    }))
    .sort((a, b) => b.value - a.value);

  const dominant = genres[0]?.value > 0 ? genres[0] : null;
  const hours = Math.floor(Math.max(0, stats.activeMs) / 3_600_000);
  const completed = Math.max(0, stats.completed ?? stats.titles);
  const dropped = Math.max(0, stats.dropped ?? 0);
  const watching = Math.max(0, stats.watching ?? 0);
  const completionBase = completed + dropped + watching;
  const completionRate = completionBase
    ? Math.round((completed / completionBase) * 100)
    : null;

  let title = 'Исследователь AnimeBox';
  let subtitle = 'Твой профиль меняется вместе с историей просмотров.';

  if (dominant && dominant.value >= 3) {
    const titles: Record<string, string> = {
      Фэнтези: 'Исследователь фэнтези',
      Экшен: 'Охотник за экшеном',
      Романтика: 'Ценитель романтики',
      Комедия: 'Любитель комедии',
      Сёнэн: 'Сёнэн-ветеран',
    };
    title = titles[dominant.label] ?? title;
    subtitle = `${dominant.label} чаще других направлений оказывается среди завершённых тайтлов.`;
  } else if (stats.episodes >= 500) {
    title = 'Архивариус сезонов';
    subtitle = 'Сотни подтверждённых эпизодов уже стали частью твоей истории.';
  } else if (stats.episodes >= 150 || hours >= 60) {
    title = 'Марафонец';
    subtitle = 'Просмотр — уже заметная часть твоего профиля AnimeBox.';
  } else if (stats.titles >= 25) {
    title = 'Коллекционер историй';
    subtitle = 'В профиле уже собралась серьёзная библиотека завершённых тайтлов.';
  } else if (stats.comments >= 25) {
    title = 'Голос сообщества';
    subtitle = 'Ты заметно участвуешь в обсуждениях AnimeBox.';
  }

  const traits: string[] = [];
  if (dominant) traits.push(`Главное направление · ${dominant.label}`);
  if (completionRate != null && completionBase >= 3) traits.push(`Досматривает · ${completionRate}%`);
  if ((stats.longestStreak ?? 0) > 1) traits.push(`Рекорд активности · ${stats.longestStreak} дн.`);
  if (hours > 0) traits.push(`Просмотр · ${hours} ч`);
  if (stats.comments > 0) traits.push(`Комментарии · ${stats.comments}`);
  if (!traits.length && stats.episodes > 0) traits.push(`Эпизоды · ${stats.episodes}`);

  return { title, subtitle, traits: traits.slice(0, 4) };
}

export default function ProfileAnimeIdentity({
  stats,
  level,
  rank,
  premium = false,
  foundingNumber,
}: Props) {
  const identity = identityFor(stats);

  return (
    <section className={styles.identity} aria-labelledby="anime-identity-title">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>ANIME IDENTITY</span>
        <h2 id="anime-identity-title">{identity.title}</h2>
        <p>{identity.subtitle}</p>
      </div>

      <div className={styles.details}>
        <div className={styles.traits} aria-label="Характер профиля">
          {identity.traits.map((trait) => (
            <span key={trait}>{trait}</span>
          ))}
        </div>

        <div className={styles.status}>
          {typeof level === 'number' && (
            <span>
              <small>Уровень</small>
              <strong>{level}</strong>
            </span>
          )}
          {rank && (
            <span>
              <small>Ранг</small>
              <strong>{rank}</strong>
            </span>
          )}
          {premium && <b>Premium identity</b>}
          {foundingNumber && <b>Founding #{String(foundingNumber).padStart(3, '0')}</b>}
        </div>
      </div>
    </section>
  );
}
