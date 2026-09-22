import Image from 'next/image';
import Link from 'next/link';

type Props = {
  animeSlug: string;
  animeTitle: string;
  latestEpisode: number;
};

export default function EpisodeDiscussionHub({
  animeSlug,
  animeTitle,
  latestEpisode,
}: Props) {
  const safeLatestEpisode =
    Number.isSafeInteger(latestEpisode) && latestEpisode > 0
      ? latestEpisode
      : 1;

  return (
    <section className="episode-discussion-hub" aria-labelledby="episode-discussion-hub-title">
      <div className="episode-discussion-hub__art" aria-hidden="true">
        <Image
          src="/brand/empty-comments.png"
          alt=""
          width={230}
          height={170}
          sizes="(max-width: 700px) 120px, 180px"
        />
      </div>

      <div className="episode-discussion-hub__copy">
        <span className="episode-discussion-hub__eyebrow">После серии</span>
        <h2 id="episode-discussion-hub-title">Обсуждай без лишних спойлеров</h2>
        <p>
          У каждой серии «{animeTitle}» своя ветка. Спойлеры скрыты, пока ты сам их не откроешь.
        </p>

        <div className="episode-discussion-hub__actions">
          <Link
            href={`/anime/${animeSlug}/episode/${safeLatestEpisode}#episode-comments`}
            className="episode-discussion-hub__primary"
          >
            Обсудить {safeLatestEpisode}-ю серию
            <span aria-hidden="true">→</span>
          </Link>

          {safeLatestEpisode !== 1 && (
            <Link
              href={`/anime/${animeSlug}/episode/1#episode-comments`}
              className="episode-discussion-hub__secondary"
            >
              С 1 серии
            </Link>
          )}
        </div>
      </div>

      <div className="episode-discussion-hub__meta" aria-label="Как устроены обсуждения">
        <span>Отдельная ветка на каждую серию</span>
        <span>Спойлеры скрыты до клика</span>
      </div>
    </section>
  );
}
