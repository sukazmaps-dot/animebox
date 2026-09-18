import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache, Suspense } from 'react';

import LibraryStatusControl from '@/components/LibraryStatusControl';

import AnimeFranchise, {
  AnimeFranchiseLoading,
} from '@/components/AnimeFranchise';

import AnimeImageCascade from '@/components/AnimeImageCascade';
import AnimeDetailControls from '@/components/AnimeDetailControls';
import AnimeNotificationControl from '@/components/AnimeNotificationControl';
import EpisodeDiscussionHub from '@/components/EpisodeDiscussionHub';
import RelatedAnime, { RelatedAnimeLoading } from '@/components/RelatedAnime';
import AdSlot from '@/components/monetization/AdSlot';

import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import { createImageCascade } from '@/lib/image-cascade';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { SITE_URL } from '@/lib/seo-config';
import {
  buildAnimeMetadata,
  buildAnimeStructuredData,
  getAnimeSeoIdentity,
} from '@/lib/anime-seo';

import type { Anime } from '@/types/anime';


type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};


const getResolvedAnime = cache(
  async (slug: string) => resolveAnimeRoute(slug),
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const anime = await getResolvedAnime(slug);

  if (!anime) {
    return {
      title: 'Аниме не найдено',
      description: 'Запрошенное аниме не найдено на AnimeBox.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const canonicalUrl = new URL(animeHref(anime), SITE_URL).toString();
  return buildAnimeMetadata(anime, canonicalUrl);
}


export default async function AnimePage({
  params,
}: PageProps) {
  const { slug } = await params;


  /* =========================================================
     Получаем тайтл
     ========================================================= */

  const resolved =
    await getResolvedAnime(slug);


  if (!resolved) {
    notFound();
  }


  /*
   * Если пользователь открыл старый / неправильный slug,
   * отправляем его на канонический URL.
   */

  if (slug !== resolved.slug) {
    permanentRedirect(
      animeHref(resolved),
    );
  }


  /* =========================================================
     ID тайтла
     ========================================================= */

  /*
   * Внутренний ID AnimeBox / Community —
   * всегда AniList ID.
   */

  const numericId =
    resolved.id;


  /*
   * Внешний MAL ID.
   */

  const malId =
    resolved.idMal;


  /* =========================================================
     AniList
     ========================================================= */

  const aniList = {
    ...resolved,

    averageScore:
      resolved.score
        ? resolved.score * 10
        : null,
  };


  /* =========================================================
     Нормализованный объект аниме
     ========================================================= */

  /*
   * MAL ID оставляем только как
   * вспомогательный внешний ID.
   *
   * НЕ используем anime.id для Community.
   */

  const anime = {
    id:
      malId ||
      numericId,

    name:
      resolved.title.romaji ||
      resolved.title.english ||
      'Без названия',

    russian:
      resolved.title.russian,

    kind:
      resolved.format,

    status:
      resolved.status,

    description:
      resolved.description,

    score:
      resolved.score,

    episodes:
      resolved.episodes,

    episodes_aired:
      resolved.episodesAired,

    genres:
      resolved.genres,

    image: {
      original: null,
      preview: null,
    },
  };


  /* =========================================================
     Изображения
     ========================================================= */

  const imageCascade =
    createImageCascade({
      aniListExtraLarge:
        aniList.coverImage
          ?.extraLarge ??
        null,

      aniListLarge:
        aniList.coverImage
          ?.large ??
        null,

      aniListBanner:
        aniList.bannerImage ??
        null,

      shikimoriOriginal:
        anime.image?.original
          ? `https://shikimori.one${anime.image.original}`
          : null,

      shikimoriPreview:
        anime.image?.preview
          ? `https://shikimori.one${anime.image.preview}`
          : null,
    });


  const posterSources = [
    ...imageCascade.posters,
    '/anime-placeholder.svg',
  ];


  const accentColor =
    aniList.coverImage?.color ||
    '#7c3aed';


  /* =========================================================
     Метаданные тайтла
     ========================================================= */

  const score =
    aniList.averageScore
      ? (
          aniList.averageScore /
          10
        ).toFixed(1)
      : anime.score ||
        null;


  const episodesCount =
    aniList.episodes ||
    anime.episodes ||
    anime.episodes_aired ||
    null;


  /* =========================================================
     Объект для контролов
     ========================================================= */

  const normalizedAnimeForControls: Anime =
    {
      /*
       * Очень важно:
       * здесь ID = AniList ID.
       */

      id:
        numericId,

      slug:
        resolved.slug,

      idMal:
        malId || null,

      mal_id:
        malId || null,

      title: {
        romaji:
          aniList.title?.romaji ||
          anime.name,

        english:
          aniList.title?.english ||
          anime.name,

        native:
          aniList.title?.native ||
          anime.name,

        russian:
          anime.russian ||
          anime.name,
      },

      description:
        anime.description ||
        null,

      score:
        score
          ? Number(score)
          : null,

      episodes:
        episodesCount,

      episodesAired:
        anime.episodes_aired ||
        null,

      status:
        aniList.status ||
        anime.status ||
        null,

      format:
        aniList.format ||
        anime.kind ||
        null,

      genres:
        Array.isArray(
          anime.genres,
        )
          ? anime.genres
          : [],

      coverImage: {
        extraLarge:
          imageCascade
            .posters[0] ||
          null,

        color:
          accentColor,
      },

      bannerImage:
        imageCascade.banner ||
        null,
    };


  const canonicalUrl =
    `${SITE_URL}${animeHref(resolved)}`;

  const seoIdentity =
    getAnimeSeoIdentity(resolved);

  const visibleAlternateNames =
    seoIdentity.aliases
      .filter((value) =>
        !seoIdentity.generatedAliases.some(
          (generated) => generated.toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU'),
        ),
      )
      .slice(0, 4);

  const animeStructuredData =
    buildAnimeStructuredData(
      resolved,
      canonicalUrl,
      imageCascade.banner || imageCascade.posters[0] || null,
    );

  const breadcrumbStructuredData = {
    '@context':
      'https://schema.org',

    '@type':
      'BreadcrumbList',

    itemListElement: [
      {
        '@type':
          'ListItem',
        position:
          1,
        name:
          'AnimeBox',
        item:
          SITE_URL,
      },
      {
        '@type':
          'ListItem',
        position:
          2,
        name:
          seoIdentity.pageHeading,
        item:
          canonicalUrl,
      },
    ],
  };

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <main
      className="
        min-h-screen
        overflow-hidden
        bg-[#08080c]
        text-white
      "
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(animeStructuredData).replace(/</g, '\\u003c'),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData).replace(/</g, '\\u003c'),
        }}
      />


      {/* =====================================================
          HERO / ОПИСАНИЕ ТАЙТЛА
          ===================================================== */}

      <section className="relative overflow-hidden">


        {/* =====================
            Banner
            ===================== */}

        {imageCascade.banner && (
          <div
            className="
              absolute
              inset-0
              bg-cover
              bg-center
            "
            style={{
              backgroundImage:
                `url("${imageCascade.banner}")`,
            }}
          />
        )}


        {/* Затемнение */}

        <div
          className="
            absolute
            inset-0
            bg-black/60
          "
        />


        {/* Градиент */}

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-b
            from-black/20
            via-[#08080c]/80
            to-[#08080c]
          "
        />


        {/* Контент */}

        <div
          className="
            anime-detail-hero

            relative

            mx-auto
            max-w-7xl

            px-4
            py-10

            md:px-6
            md:py-16
          "
        >


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


            {/* =====================
                Постер
                ===================== */}

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
                  sources={
                    posterSources
                  }
                  alt={
                    anime.russian ||
                    anime.name ||
                    'Аниме'
                  }
                  loading="eager"
                />

              </div>

            </div>


            {/* =====================
                Информация
                ===================== */}

            <div
              className="
                anime-detail-content
                min-w-0
              "
            >


              {/* Тип / статус */}

              <div
                className="
                  mb-4

                  flex
                  flex-wrap
                  gap-2
                "
              >

                {anime.kind && (
                  <span
                    className="
                      rounded-full

                      border

                      bg-white/10

                      px-3
                      py-1

                      text-xs
                      font-semibold
                    "
                    style={{
                      borderColor:
                        `${accentColor}66`,
                    }}
                  >
                    {anime.kind.toUpperCase()}
                  </span>
                )}


                {anime.status && (
                  <span
                    className="
                      rounded-full

                      border
                      border-white/10

                      bg-white/10

                      px-3
                      py-1

                      text-xs
                      font-semibold
                    "
                  >

                    {anime.status ===
                      'released' ||
                    anime.status ===
                      'FINISHED'
                      ? 'Вышло'
                      : anime.status ===
                            'ongoing' ||
                          anime.status ===
                            'RELEASING'
                        ? 'Онгоинг'
                        : anime.status}

                  </span>
                )}

              </div>


              {/* SEO-friendly season context without changing canonical URLs. */}

              {seoIdentity.seasonLabel && (
                <div className="mb-3">
                  <span className="inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">
                    {seoIdentity.seasonLabel}
                  </span>
                </div>
              )}

              {/* Название */}

              <h1
                className="
                  text-3xl
                  font-black
                  tracking-tight

                  md:text-5xl
                "
              >
                {seoIdentity.pageHeading}
              </h1>


              {/* Оригинальное название */}

              {anime.name &&
                anime.russian &&
                anime.name !==
                  anime.russian && (

                  <p
                    className="
                      mt-2

                      text-lg
                      text-white/50
                    "
                  >
                    {anime.name}
                  </p>

                )}

              {visibleAlternateNames.length > 0 && (
                <p className="mt-3 max-w-3xl text-xs leading-5 text-white/35 md:text-sm">
                  <span className="text-white/50">Другие названия:</span>{' '}
                  {visibleAlternateNames.join(' · ')}
                </p>
              )}


              {/* Описание */}

              {anime.description && (
                <p
                  className="
                    mt-6

                    max-w-3xl

                    whitespace-pre-line

                    text-sm
                    leading-7
                    text-white/70

                    md:text-base
                  "
                >
                  {cleanShikimoriDescription(
                    anime.description,
                  )}
                </p>
              )}


              {/* Рейтинг / эпизоды */}

              <div
                className="
                  mt-6

                  flex
                  flex-wrap
                  items-center
                  gap-4

                  text-sm
                  font-medium
                "
              >


                {/* Рейтинг */}

                {score && (
                  <div
                    className="
                      flex
                      items-center
                      gap-1.5

                      rounded-xl

                      border
                      border-white/10

                      bg-white/5

                      px-3.5
                      py-2
                    "
                  >

                    <span className="text-amber-400">
                      ★
                    </span>

                    <span
                      className="
                        text-base
                        font-bold
                      "
                    >
                      {score}
                    </span>

                    <span className="text-white/40">
                      / 10
                    </span>

                  </div>
                )}


                {/* Количество эпизодов */}

                {episodesCount && (
                  <div
                    className="
                      flex
                      items-center
                      gap-1.5

                      rounded-xl

                      border
                      border-white/10

                      bg-white/5

                      px-3.5
                      py-2

                      text-white/80
                    "
                  >

                    <span>
                      Эпизоды:
                    </span>

                    <span
                      className="
                        font-bold
                        text-white
                      "
                    >
                      {episodesCount}
                    </span>

                  </div>
                )}

              </div>


              {/* =====================
                  Кнопки тайтла
                  ===================== */}

              <div className="mt-6">

                <AnimeDetailControls
                  anime={
                    normalizedAnimeForControls
                  }
                  showEpisodes={
                    false
                  }
                />

              </div>


            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          БИБЛИОТЕКА
          ===================================================== */}

      <section
        className="
          anime-detail-library-section

          mx-auto
          max-w-7xl

          px-4
          pt-2
          pb-4

          md:px-6
        "
      >

        <LibraryStatusControl
          animeId={
            numericId
          }
        />

        <AnimeNotificationControl
          animeId={numericId}
          animeSlug={resolved.slug}
          animeTitle={anime.russian || anime.name}
          episodesAired={anime.episodes_aired || 0}
        />

      </section>


      {/* =====================================================
          ФРАНШИЗА
          ===================================================== */}

      {aniList.id && (

        <section
          className="
            anime-detail-franchise-section

            border-t
            border-white/[0.04]

            pt-2
            pb-14
          "
        >

          <Suspense
            key={
              aniList.id
            }
            fallback={
              <AnimeFranchiseLoading />
            }
          >

            <AnimeFranchise
              animeId={
                aniList.id
              }
              currentTitle={
                anime.russian ||
                anime.name
              }
            />

          </Suspense>

        </section>

      )}


      {/* =====================================================
          ОБСУЖДЕНИЯ СЕРИЙ
          ===================================================== */}

      <section className="anime-detail-after-hero mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <EpisodeDiscussionHub
          animeSlug={resolved.slug}
          animeTitle={anime.russian || anime.name}
          latestEpisode={Math.max(1, anime.episodes_aired || 1)}
        />
      </section>


      <section className="anime-detail-after-hero mx-auto max-w-7xl px-4 pb-5 md:px-6">
        <AdSlot placement="anime-detail-before-related" format="native" />
      </section>

      {/* =====================================================
          ПОХОЖИЕ АНИМЕ / ВНУТРЕННЯЯ ПЕРЕЛИНКОВКА
          ===================================================== */}

      <Suspense fallback={<RelatedAnimeLoading />}>
        <RelatedAnime
          animeId={numericId}
          genres={resolved.genres}
        />
      </Suspense>


    </main>
  );
}