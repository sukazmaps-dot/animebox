import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import AnimeEpisodePage from '@/components/AnimeEpisodePage';
import { resolveAnimeRoute } from '@/lib/anime-route';

export const metadata: Metadata = {
  title: 'Watch Together',
  description: 'Приватная комната совместного просмотра AnimeBox.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

function parseEpisode(value: string) {
  const episode = Number(value);
  return Number.isSafeInteger(episode) && episode > 0 ? episode : null;
}

export default async function WatchTogetherEpisodePage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { slug, episode } = await params;
  const episodeNumber = parseEpisode(episode);

  if (!episodeNumber) notFound();

  const anime = await resolveAnimeRoute(slug);
  if (!anime) notFound();

  return (
    <AnimeEpisodePage
      key={`${anime.slug}:${episodeNumber}:watch-together`}
      anime={anime}
      requestedEpisode={episodeNumber}
      theaterMode
    />
  );
}
