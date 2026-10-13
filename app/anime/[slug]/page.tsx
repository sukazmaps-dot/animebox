import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache, Suspense, type CSSProperties } from 'react';

import AnimePersonalPanel from '@/components/AnimePersonalPanel';
import layout from './detail-layout.module.css';
import { findAnimeGenre } from '@/lib/anime-taxonomy';
import { SEO_GENRE_LANDINGS } from '@/lib/search-seo';
import { CATALOG_DISCOVERY_FILTERS } from '@/lib/catalog-filter-state';
import AnimeSynopsis from '@/components/AnimeSynopsis';
import LibraryStatusControl from '@/components/LibraryStatusControl';
import styles from './page.module.css';

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
import { animeContentFacts } from '@/lib/anime-content-intelligence';
import { SITE_URL } from '@/lib/seo-config';
import { getPlaybackRestriction } from '@/lib/copyright-server';
import {
  buildAnimeMetadata,
  buildAnimeStructuredData,
  getAnimeSeoIdentity,
} from '@/lib/anime-seo';

import type { Anime } from '@/types/anime';


function genreLink(value: string) {
  const landing = SEO_GENRE_LANDINGS.find((item) => item.value === value);
  if (landing) return `/anime/genre/${landing.slug}`;
  const filter = CATALOG_DISCOVERY_FILTERS.find((item) => item.provider === 'genre' && item.value === value);
  return filter ? `/search?tags=${encodeURIComponent(filter.id)}` : '/search';
}

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
    // A transient server failure must not emit a persistent noindex policy.
    throw error;
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
    (/^#[0-9a-f]{6}$/i.test(aniList.coverImage?.color || '') ? aniList.coverImage?.color : null) ||
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

  const synopsis = anime.description ? cleanShikimoriDescription(anime.description) : '';

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <main
      className={`${styles.page} anime-detail-v3 anime-detail-v4
        min-h-screen
        overflow-hidden
        bg-[#08080c]
        text-white`}
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


      <div className={layout.layout}>
        <aside className={layout.sidebar} aria-label="Обложка и личные действия">
          <div className={layout.poster}>
            <AnimeImageCascade sources={posterSources} alt={seoIdentity.pageHeading}
              loading="eager" fetchPriority="high" preset="large" quality={80}
              sizes="(max-width: 767px) 112px, 260px" />
          </div>
          <div className={layout.facts} aria-label="Коротко о тайтле">
            {[contentFacts.release, contentFacts.format, contentFacts.episodes, contentFacts.status, seoIdentity.seasonLabel].filter(Boolean).map((fact, index) => (
              <span key={`${index}-${fact}`}>{fact}</span>
            ))}
            {score && <span>★ {score} / 10 · AniList</span>}
          </div>
          <div className={layout.actions}>
            {playbackRestricted ? <PlaybackRestrictionNotice /> : (
              <AnimeDetailControls anime={normalizedAnimeForControls} showEpisodes={false} />
            )}
          </div>
          <div className={layout.personal}>
            <AnimePersonalPanel animeHref={animeHref(resolved)}>
              <LibraryStatusControl animeId={numericId} variant="inline" />
              {!playbackRestricted && String(resolved.status).toUpperCase() !== 'FINISHED' && (
                <AnimeNotificationControl animeId={numericId} animeSlug={resolved.slug}
                  animeTitle={seoIdentity.pageHeading} episodesAired={anime.episodes_aired || 0}
                  isFinished={false} variant="inline" />
              )}
              <AnimeRatingControl animeId={numericId} />
            </AnimePersonalPanel>
          </div>
          {!playbackRestricted && <Link className={layout.together} href="/watch-together">Смотреть с друзьями →</Link>}
        </aside>
        <div className={layout.mainColumn}>
          <header className={layout.identity}>
            <nav className={layout.breadcrumbs} aria-label="Навигация по каталогу">
              <Link href="/search">Каталог</Link><span aria-hidden="true"> / </span><span>{seoIdentity.pageHeading}</span>
            </nav>
            <h1>{seoIdentity.pageHeading}</h1>
            {anime.name && anime.russian && anime.name !== anime.russian && <p>{anime.name}</p>}
            <div className={layout.genres} aria-label="Жанры">
              {Array.from(new Map((resolved.genres || []).map((genre) => {
                const match = findAnimeGenre(genre);
                return [match?.value || genre, { value: match?.value || genre, label: match?.label || genre }];
              })).values()).slice(0, 6).map((genre) => (
                <Link key={genre.value} href={genreLink(genre.value)}>{genre.label}</Link>
              ))}
            </div>
          </header>
          <section className={layout.description} aria-label="Описание и другие названия">
            {synopsis && <AnimeSynopsis text={synopsis} />}
            {visibleAlternateNames.length > 0 && (
              <details><summary>Другие названия</summary><p>{visibleAlternateNames.join(' · ')}</p></details>
            )}
          </section>
          <div className={layout.episodes}>      {!playbackRestricted && (
        <section
          className="anime-detail-v4__episodes mx-auto w-full pb-4"
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


</div>
          <details className={layout.franchise}><summary>Порядок частей</summary>      {aniList.id && (

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

</details>
          <div className={layout.discussion}>      <section className={`${styles.discussion} anime-detail-after-hero mx-auto w-full max-w-5xl pb-6`}>
        <EpisodeDiscussionHub
          animeSlug={resolved.slug}
          animeTitle={anime.russian || anime.name}
          latestEpisode={Math.max(1, anime.episodes_aired || 1)}
        />
      </section>

</div>
          <div className={layout.related}>      <section className="anime-detail-after-hero mx-auto w-full pb-4">
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
      </Suspense></div>
        </div>
      </div>

    </main>
  );
}