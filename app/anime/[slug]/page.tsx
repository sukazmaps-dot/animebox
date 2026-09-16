import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import LibraryStatusControl from '@/components/LibraryStatusControl';

import AnimeFranchise, {
  AnimeFranchiseLoading,
} from '@/components/AnimeFranchise';

import AnimeImageCascade from '@/components/AnimeImageCascade';
import AnimeDetailControls from '@/components/AnimeDetailControls';
import AnimeNotificationControl from '@/components/AnimeNotificationControl';
import RelatedAnime, { RelatedAnimeLoading } from '@/components/RelatedAnime';

import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import { createImageCascade } from '@/lib/image-cascade';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { cleanSeoText, truncateSeoText } from '@/lib/seo-text';
import { SITE_URL } from '@/lib/seo-config';
import { getAnimeTitle } from '@/lib/anime-display';

import type { Anime } from '@/types/anime';


type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function seoDescription(anime: Anime): string {
  const title = getAnimeTitle(anime);
  const cleaned = cleanSeoText(cleanShikimoriDescription(anime.description));

  const facts = [
    anime.episodes && anime.episodes > 0 ? `${anime.episodes} серий` : null,
    anime.startDate?.year ? String(anime.startDate.year) : null,
    anime.genres?.slice(0, 2).join(', ') || null,
  ].filter((value): value is string => Boolean(value));

  const intro = `Смотреть «${title}» онлайн на AnimeBox.`;
  const details = facts.length ? ` ${facts.join(' · ')}.` : '';
  const fallback =
    'Описание, рейтинг, список серий, похожие аниме и сохранение прогресса просмотра.';

  return truncateSeoText(
    `${intro}${details} ${cleaned || fallback}`,
    158,
  );
}

function structuredDate(date?: Anime['startDate']): string | undefined {
  if (!date?.year) {
    return undefined;
  }

  const month = String(date.month ?? 1).padStart(2, '0');
  const day = String(date.day ?? 1).padStart(2, '0');

  return `${date.year}-${month}-${day}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const anime = await resolveAnimeRoute(slug);

  if (!anime) {
    return {
      title: 'Аниме не найдено',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = getAnimeTitle(anime);
  const canonical = animeHref(anime);
  const description = seoDescription(anime);
  const socialImage =
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    '/backgrounds/hero-fallback.webp';

  return {
    title: `${title} — смотреть онлайн, серии и описание`,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'AnimeBox',
      locale: 'ru_RU',
      title: `${title} — AnimeBox`,
      description,
      images: [
        {
          url: socialImage,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — AnimeBox`,
      description,
      images: [socialImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}


export default async function AnimePage({
  params,
}: PageProps) {
  const { slug } = await params;


  /* =========================================================
     Получаем тайтл
     ========================================================= */

  const resolved =
    await resolveAnimeRoute(slug);


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

  const title =
    getAnimeTitle(resolved);

  const description =
    seoDescription(resolved);

  const alternateNames =
    Array.from(new Set([
      resolved.title.russian,
      resolved.title.english,
      resolved.title.romaji,
      resolved.title.native,
    ]))
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0 &&
          value.trim() !== title,
      );

  const schemaType =
    resolved.format === 'MOVIE' ||
    resolved.format === 'Фильм'
      ? 'Movie'
      : 'TVSeries';

  const animeStructuredData = {
    '@context':
      'https://schema.org',

    '@type':
      schemaType,

    name:
      title,

    alternateName:
      alternateNames.length
        ? alternateNames
        : undefined,

    description:
      description,

    url:
      canonicalUrl,

    image:
      imageCascade.banner ||
      imageCascade.posters[0] ||
      undefined,

    genre:
      resolved.genres.length
        ? resolved.genres
        : undefined,

    datePublished:
      structuredDate(
        resolved.startDate,
      ),

    numberOfEpisodes:
      episodesCount ||
      undefined,

    sameAs:
      resolved.idMal
        ? [
            `https://myanimelist.net/anime/${resolved.idMal}`,
          ]
        : undefined,
  };

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
          title,
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


              {/* Название */}

              <h1
                className="
                  text-3xl
                  font-black
                  tracking-tight

                  md:text-5xl
                "
              >
                {anime.russian ||
                  anime.name}
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