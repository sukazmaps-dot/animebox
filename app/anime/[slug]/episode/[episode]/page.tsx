import { notFound, permanentRedirect } from 'next/navigation';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import AnimeEpisodePage from '@/components/AnimeEpisodePage';
export default async function EpisodePage({ params }: { params: Promise<{ slug: string; episode: string }> }) {
  const { slug, episode } = await params;
  const number = Number(episode);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
  const anime = await resolveAnimeRoute(slug);
  if (!anime) notFound();
  if (slug !== anime.slug) permanentRedirect(`${animeHref(anime)}/episode/${number}`);
  return <AnimeEpisodePage key={anime.slug} anime={anime} requestedEpisode={number} />;
}
