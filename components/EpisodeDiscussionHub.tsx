import Link from 'next/link';
import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  EyeSlashIcon,
  GitBranchIcon,
} from '@phosphor-icons/react/ssr';

import AnimeBoxIconCore from '@/components/ui/AnimeBoxIconCore';

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
      <div className="episode-discussion-hub__visual">
        <AnimeBoxIconCore size="large" className="episode-discussion-hub__icon-core">
          <ChatCircleTextIcon size={42} weight="light" />
        </AnimeBoxIconCore>
      </div>

      <div className="episode-discussion-hub__copy">
        <span className="episode-discussion-hub__eyebrow">После серии</span>
        <h2 id="episode-discussion-hub-title">Обсуждай без лишних спойлеров</h2>
        <p>
          У каждой серии «{animeTitle}» своя ветка. Спойлеры остаются скрытыми,
          пока ты сам не решишь их открыть.
        </p>

        <div className="episode-discussion-hub__actions">
          <Link
            href={`/anime/${animeSlug}/episode/${safeLatestEpisode}#episode-comments`}
            className="ab-action ab-action--primary episode-discussion-hub__primary"
          >
            Обсудить {safeLatestEpisode}-ю серию
            <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
          </Link>

          {safeLatestEpisode !== 1 && (
            <Link
              href={`/anime/${animeSlug}/episode/1#episode-comments`}
              className="ab-action ab-action--secondary episode-discussion-hub__secondary"
            >
              С 1 серии
            </Link>
          )}
        </div>
      </div>

      <div className="episode-discussion-hub__meta" aria-label="Как устроены обсуждения">
        <span>
          <GitBranchIcon size={15} weight="regular" aria-hidden="true" />
          <b>Отдельная ветка</b>
          <small>для каждой серии</small>
        </span>
        <span>
          <EyeSlashIcon size={15} weight="regular" aria-hidden="true" />
          <b>Без спойлеров</b>
          <small>пока не откроешь</small>
        </span>
      </div>
    </section>
  );
}
