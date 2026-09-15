import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import AnimeFranchise, { AnimeFranchiseLoading } from '@/components/AnimeFranchise';
import { createImageCascade } from '@/lib/image-cascade';
import {
  cleanShikimoriDescription,
} from '@/lib/shikimori-text';
import AnimeImageCascade from '@/components/AnimeImageCascade';
import AnimeDetailControls from '@/components/AnimeDetailControls';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AnimePage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await resolveAnimeRoute(slug);
  if (!resolved) notFound();
  if (slug !== resolved.slug) permanentRedirect(animeHref(resolved));
  const numericId = resolved.id;

  // Reuse the resolved, localized object. No second detail request/false 404.
  const aniList = { ...resolved, averageScore: resolved.score ? resolved.score * 10 : null };
  const malId = resolved.idMal;
  const anime = {
    id: malId || numericId,
    name: resolved.title.romaji || resolved.title.english || 'Без названия',
    russian: resolved.title.russian,
    kind: resolved.format,
    status: resolved.status,
    description: resolved.description,
    score: resolved.score,
    episodes: resolved.episodes,
    episodes_aired: resolved.episodesAired,
    genres: resolved.genres,
    image: { original: null, preview: null },
  };

  const imageCascade = createImageCascade({
    aniListExtraLarge: aniList?.coverImage?.extraLarge ?? null,
    aniListLarge: aniList?.coverImage?.large ?? null,
    aniListBanner: aniList?.bannerImage ?? null,
    shikimoriOriginal: anime.image?.original ? `https://shikimori.one${anime.image.original}` : null,
    shikimoriPreview: anime.image?.preview ? `https://shikimori.one${anime.image.preview}` : null,
  });

  const posterSources = [...imageCascade.posters, '/anime-placeholder.svg'];
  const accentColor = aniList?.coverImage?.color || '#7c3aed';

  // Извлекаем рейтинг и эпизоды из обоих источников для красивого отображения
  const score = aniList?.averageScore ? (aniList.averageScore / 10).toFixed(1) : (anime.score || null);
  const episodesCount =
    aniList?.episodes ||
    anime.episodes ||
    anime.episodes_aired ||
    null;

  const normalizedAnimeForControls = {
    id: aniList?.id || numericId,
    slug: resolved.slug,
    idMal: malId || anime.id,
    mal_id: malId || anime.id,
    title: {
      romaji: aniList?.title?.romaji || anime.name,
      english: aniList?.title?.english || anime.name,
      native: aniList?.title?.native || anime.name,
      russian: anime.russian || anime.name,
    },
    description: anime.description || null,
    score: score ? Number(score) : null,
    episodes: episodesCount,
    episodesAired: anime.episodes_aired || null,
    status: aniList?.status || anime.status || null,
    format: aniList?.format || anime.kind || null,
    genres: Array.isArray(anime.genres) ? anime.genres : [],
    coverImage: {
      extraLarge: imageCascade.posters[0] || null,
      color: accentColor,
    },
    bannerImage: imageCascade.banner || null,
  };

  return (
  <main className="min-h-screen overflow-hidden bg-[#08080c] text-white">
    <section className="relative overflow-hidden">
      {imageCascade.banner && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${imageCascade.banner}")`,
          }}
        />
      )}

      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#08080c]/80 to-[#08080c]" />

      <div className="anime-detail-hero relative mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-16">
        <div
          className="
            anime-detail-grid
            grid
            grid-cols-1
            items-start
            gap-8
            md:grid-cols-[230px_minmax(0,1fr)]
            md:items-stretch
            lg:grid-cols-[260px_minmax(0,1fr)]
            lg:gap-10
          "
        >
          {/* Постер */}
          <div
            className="
              anime-detail-poster
              relative
              overflow-hidden
              rounded-xl
              border
              border-white/10
              bg-white/5
              shadow-lg
              md:min-h-[420px]
              md:self-stretch
            "
          >
            <div
              className="
                aspect-[2/3]
                md:absolute
                md:inset-0
                md:h-full
                md:w-full
                md:aspect-auto
              "
            >
              <AnimeImageCascade
                sources={posterSources}
                alt={
                  anime.russian ||
                  anime.name ||
                  'Аниме'
                }
                loading="eager"
              />
            </div>
          </div>

          {/* Информация */}
          <div className="anime-detail-content min-w-0">
            <div className="mb-4 flex flex-wrap gap-2">
              {anime.kind && (
                <span
                  className="rounded-full border bg-white/10 px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: `${accentColor}66`,
                  }}
                >
                  {anime.kind.toUpperCase()}
                </span>
              )}

              {anime.status && (
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold">
                  {anime.status === 'released' ||
                  anime.status === 'FINISHED'
                    ? 'Вышло'
                    : anime.status === 'ongoing' ||
                        anime.status === 'RELEASING'
                      ? 'Онгоинг'
                      : anime.status}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              {anime.russian || anime.name}
            </h1>

            {anime.name &&
              anime.russian &&
              anime.name !== anime.russian && (
                <p className="mt-2 text-lg text-white/50">
                  {anime.name}
                </p>
              )}

            {anime.description && (
              <p className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-7 text-white/70 md:text-base">
                {cleanShikimoriDescription(
                  anime.description,
                )}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium">
              {score && (
                <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2">
                  <span className="text-amber-400">
                    ★
                  </span>

                  <span className="text-base font-bold">
                    {score}
                  </span>

                  <span className="text-white/40">
                    / 10
                  </span>
                </div>
              )}

              {episodesCount && (
                <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-white/80">
                  <span>Эпизоды:</span>

                  <span className="font-bold text-white">
                    {episodesCount}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6">
              <AnimeDetailControls
                anime={
                  normalizedAnimeForControls as any
                }
                showEpisodes={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    {aniList?.id && (
      <Suspense
        key={aniList.id}
        fallback={<AnimeFranchiseLoading />}
      >
        <AnimeFranchise
          animeId={aniList.id}
          currentTitle={
            anime.russian ||
            anime.name
          }
        />
      </Suspense>
    )}
  </main>
);
}
export async function generateMetadata({ params }: PageProps) {
  const anime = await resolveAnimeRoute((await params).slug);
  return { title: anime ? `${anime.title.russian || anime.title.romaji || anime.title.english} — AnimeBox` : 'Аниме не найдено' };
}
