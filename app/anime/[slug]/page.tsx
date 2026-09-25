import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache, Suspense, type CSSProperties } from 'react';

import LibraryStatusControl from '@/components/LibraryStatusControl';

import AnimeFranchise, {
  AnimeFranchiseLoading,
} from '@/components/AnimeFranchise';

import AnimeImageCascade from '@/components/AnimeImageCascade';
import AnimeDetailControls from '@/components/AnimeDetailControls';
import AnimeNotificationControl from '@/components/AnimeNotificationControl';
import AnimeRatingControl from '@/components/AnimeRatingControl';
import EpisodeDiscussionHub from '@/components/EpisodeDiscussionHub';
import EpisodeList from '@/components/EpisodeList';
import RelatedAnime, { RelatedAnimeLoading } from '@/components/RelatedAnime';
import AdSlot from '@/components/monetization/AdSlot';
import PlaybackRestrictionNotice from '@/components/PlaybackRestrictionNotice';

import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import { createImageCascade } from '@/lib/image-cascade';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { animeContentFacts, animeFormatLabel, animeStatusLabel } from '@/lib/anime-content-intelligence';
import { SITE_URL } from '@/lib/seo-config';
import { getPlaybackRestriction } from '@/lib/copyright-server';
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

  let anime = null;
  try {
    anime = await getResolvedAnime(slug);
  } catch (error) {
    console.error('[Anime metadata] title resolution failed:', error);
    return {
      title: 'AnimeBox — тайтл временно недоступен',
      description: 'Не удалось временно загрузить данные тайтла.',
      robots: { index: false, follow: true },
    };
  }

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
  const restriction = await getPlaybackRestriction({ animeId: anime.id });

  if (!restriction) {
    return buildAnimeMetadata(anime, canonicalUrl);
  }

  const identity = getAnimeSeoIdentity(anime);
  const description =
    `Информация об аниме «${identity.pageHeading}» на AnimeBox. Воспроизведение для этого тайтла недоступно.`;
  const images = [
    anime.bannerImage,
    anime.coverImage?.extraLarge,
    anime.coverImage?.large,
  ].filter((value): value is string => Boolean(value));

  return {
    title: `${identity.pageHeading} — информация об аниме`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      siteName: 'AnimeBox',
      locale: 'ru_RU',
      title: `${identity.pageHeading} — информация об аниме`,
      description,
      images: images.length ? images.map((url) => ({ url })) : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${identity.pageHeading} — информация об аниме`,
      description,
      images: images.length ? images.slice(0, 1) : undefined,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': 0,
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

  const copyrightRestriction = await getPlaybackRestriction({
    animeId: numericId,
  });
  const playbackRestricted = Boolean(copyrightRestriction);


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

  const contentFacts = animeContentFacts({
    ...resolved,
    episodes: episodesCount,
  });
  const formatLabel = animeFormatLabel(anime.kind);
  const statusLabel = animeStatusLabel(anime.status);


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
    playbackRestricted
      ? null
      : buildAnimeStructuredData(
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
      className="anime-detail-v3 anime-detail-v4
        min-h-screen
        overflow-hidden
        bg-[#08080c]
        text-white
      "
      style={{ '--anime-page-accent': accentColor } as CSSProperties}
    >
      {animeStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(animeStructuredData).replace(/</g, '\\u003c'),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData).replace(/</g, '\\u003c'),
        }}
      />


      {/* =====================================================
          HERO / ОПИСАНИЕ ТАЙТЛА
          ===================================================== */}

      <section className="anime-detail-v4__hero-shell relative overflow-hidden">


        {/* =====================
            Banner
            ===================== */}

        {imageCascade.banner && (
          <img
            src={imageCascade.banner}
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="low"
            decoding="async"
            referrerPolicy="no-referrer"
            className="anime-detail-v3__banner absolute inset-0 h-full w-full object-cover object-center"
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
                  fetchPriority="high"
                  preset="large"
                  quality={80}
                  sizes="(max-width: 767px) 68vw, (max-width: 1024px) 230px, 260px"
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
              <nav className="anime-detail-v4__breadcrumbs" aria-label="Навигация по каталогу">
                <Link href="/search">Каталог</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{anime.russian || anime.name}</span>
              </nav>


              {/* Тип / статус */}

              <div
                className="
                  anime-detail-v4__chips
                  mb-4

                  flex
                  flex-wrap
                  gap-2
                "
              >

                {anime.kind && (
                  <span
                    className="
                      anime-detail-v4__chip
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
                    {formatLabel || anime.kind}
                  </span>
                )}


                {anime.status && (
                  <span
                    className="
                      anime-detail-v4__chip
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

                    {statusLabel || anime.status}

                  </span>
                )}

              </div>


              {/* SEO-friendly season context without changing canonical URLs. */}

              {seoIdentity.seasonLabel && (
                <div className="mb-3">
                  <span className="anime-detail-v4__chip anime-detail-v4__season-chip inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
                    {seoIdentity.seasonLabel}
                  </span>
                </div>
              )}

              {/* Название */}

              <h1
                className="
                  anime-detail-v4__title
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
                      anime-detail-v4__original-title
                      mt-2

                      text-lg
                      text-white/50
                    "
                  >
                    {anime.name}
                  </p>

                )}

              {visibleAlternateNames.length > 0 && (
                <p className="anime-detail-v4__aliases mt-3 max-w-3xl text-xs leading-5 text-white/35 md:text-sm">
                  <span className="text-white/50">Другие названия:</span>{' '}
                  {visibleAlternateNames.join(' · ')}
                </p>
              )}


              {/* Описание */}

              {anime.description && (
                <p
                  className="
                    anime-detail-v4__description
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
                  anime-detail-v4__metrics
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

                {playbackRestricted ? (
                  <PlaybackRestrictionNotice />
                ) : (
                  <AnimeDetailControls
                    anime={normalizedAnimeForControls}
                    showEpisodes={false}
                  />
                )}

              </div>


            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          CONTENT INTELLIGENCE / КОРОТКИЙ ПАСПОРТ ТАЙТЛА
          ===================================================== */}

      <section className="anime-detail-v3__facts mx-auto max-w-7xl px-4 pb-5 md:px-6" aria-labelledby="anime-facts-title">
        <div className="anime-detail-v3__facts-shell">
          <div className="anime-detail-v3__facts-heading">
            <span>О тайтле</span>
            <h2 id="anime-facts-title">Коротко</h2>
          </div>

          <dl className="anime-detail-v3__facts-list">
            {contentFacts.release && (
              <div>
                <dt>Выход</dt>
                <dd>{contentFacts.release}</dd>
              </div>
            )}

            {contentFacts.format && (
              <div>
                <dt>Формат</dt>
                <dd>{contentFacts.format}</dd>
              </div>
            )}

            {contentFacts.episodes && (
              <div>
                <dt>Объём</dt>
                <dd>{contentFacts.episodes}</dd>
              </div>
            )}

            {contentFacts.status && (
              <div>
                <dt>Статус</dt>
                <dd>{contentFacts.status}</dd>
              </div>
            )}

            {seoIdentity.seasonLabel && (
              <div>
                <dt>Часть</dt>
                <dd>{seoIdentity.seasonLabel}</dd>
              </div>
            )}
          </dl>

          {resolved.genres?.length > 0 && (
            <div className="anime-detail-v3__genres" aria-label="Жанры">
              {resolved.genres.slice(0, 6).map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          СЕЗОНЫ / ЭПИЗОДЫ
          ===================================================== */}

      {!playbackRestricted && (
        <section
          className="anime-detail-v4__episodes mx-auto max-w-7xl px-4 pb-6 pt-2 md:px-6"
          aria-labelledby="anime-episodes-title"
        >
          <div className="anime-detail-v4__section-head">
            <div>
              <span>Эпизоды</span>
              <h2 id="anime-episodes-title">Сезоны и эпизоды</h2>
              <p>Выбери часть и продолжай с нужной серии.</p>
            </div>
            <Link href={`${animeHref(resolved)}/watch`}>Открыть просмотр →</Link>
          </div>

          <div className="detail__episodes anime-detail-v4__episode-list">
            <EpisodeList
              trackingAnimeId={numericId}
              animeId={resolved.slug}
              episodes={anime.episodes}
              episodesAired={anime.episodes_aired}
              totalEpisodesKnown={Boolean(anime.episodes && anime.episodes > 0)}
            />
          </div>
        </section>
      )}


      {/* =====================================================
          БИБЛИОТЕКА
          ===================================================== */}

      <section
        className="anime-detail-library-section anime-detail-v4__personal mx-auto max-w-7xl px-4 pb-6 pt-2 md:px-6"
        aria-labelledby="anime-personal-title"
      >
        <div className="anime-detail-v4__section-head anime-detail-v4__section-head--compact">
          <div>
            <span>МОЙ ANIMEBOX</span>
            <h2 id="anime-personal-title">Сохрани тайтл под себя</h2>
          </div>
        </div>

        <div className="anime-detail-v4__personal-grid">
          <LibraryStatusControl
            animeId={numericId}
            variant="compact"
          />

          {!playbackRestricted && (
            <AnimeNotificationControl
              animeId={numericId}
              animeSlug={resolved.slug}
              animeTitle={anime.russian || anime.name}
              episodesAired={anime.episodes_aired || 0}
              isFinished={String(resolved.status).toUpperCase() === 'FINISHED'}
              variant="compact"
            />
          )}

          <AnimeRatingControl animeId={numericId} />
        </div>
      </section>



      {/* =====================================================
          WATCH TOGETHER / LONG-TAIL SEO + ПЕРЕЛИНКОВКА
          ===================================================== */}

      {!playbackRestricted && (
        <section
        className="anime-detail-v4__watch-together mx-auto max-w-7xl px-4 pb-7 md:px-6"
        aria-labelledby="watch-together-anime-title"
      >
        <div className="anime-detail-v4__watch-together-inner">
          <div className="min-w-0">
            <span>ВМЕСТЕ</span>
            <h2 id="watch-together-anime-title">
              Смотреть «{seoIdentity.pageHeading}» с друзьями
            </h2>
            <p>
              Открой комнату, отправь ссылку — AnimeBox синхронизирует просмотр.
            </p>
          </div>

          <Link href="/watch-together">
            Открыть комнаты <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
      )}

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