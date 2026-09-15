import { redirect } from 'next/navigation';

type WatchPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
};

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { slug } = await params;
  const { ep } = await searchParams;
  const episode = Number.parseInt(ep ?? '1', 10);
  const safeEpisode = Number.isInteger(episode) && episode > 0 ? episode : 1;

  redirect(`/anime/${slug}/episode/${safeEpisode}`);
}
