import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import AnimeEpisodePage from '@/components/AnimeEpisodePage';
import { getAnimeSeoIdentity } from '@/lib/anime-seo';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { animeHref } from '@/lib/anime-url';
import {
  buildEpisodeSeoDescription,
  buildEpisodeSeoTitle,
  buildEpisodeVideoStructuredData,
  isEpisodeIndexable,
} from '@/lib/episode-seo';
import { SITE_URL } from '@/lib/seo-config';
import { getSeoEpisodeIndexEntry } from '@/lib/seo-episode-index';
import { getEpisodeTimelineForSeo } from '@/lib/episode-timeline-server';
import {
  COPYRIGHT_RESTRICTED_MESSAGE,
  getPlaybackRestriction,
} from '@/lib/copyright-server';

const parseEpisode = (value: string): number | null => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

function EpisodeRouteRecovery({
  slug,
  episode,
}: {
  slug: string;
  episode: number;
}) {
  const retryHref = `/anime/${encodeURIComponent(slug)}/episode/${episode}`;
  const animeHrefValue = `/anime/${encodeURIComponent(slug)}`;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 md:px-6">
      <section className="w-full rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/70">
          AnimeBox · Playback
        </p>
        <h1 className="mt-3 text-2xl font-black text-white md:text-3xl">
          Страница серии временно недоступна
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
          Не удалось получить обязательные данные тайтла. Это не означает, что
          серия удалена: AnimeBox не показывает системную ошибку вместо плеера и
          предлагает повторить запрос позже.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={retryHref}
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400"
          >
            Повторить
          </a>
          <a
            href={animeHrefValue}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            К тайтлу
          </a>
          <a
            href="/search"
            className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm font-semibold text-white/55 transition hover:text-white"
          >
            В каталог
          </a>
        </div>
      </section>
    </main>
  );
}

function CopyrightRestrictedEpisode({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 md:px-6">
      <section className="w-full rounded-2xl border border-amber-200/10 bg-slate-950/80 p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/65">
          AnimeBox · Copyright
        </p>
        <h1 className="mt-3 text-2xl font-black text-white md:text-3xl">
          Просмотр недоступен
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
          {COPYRIGHT_RESTRICTED_MESSAGE} Информационная страница тайтла
          «{title}» остаётся доступна.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`/anime/${encodeURIComponent(slug)}`}
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400"
          >
            К тайтлу
          </a>
          <a
            href="/copyright"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]"
          >
            Информация для правообладателей
          </a>
        </div>
      </section>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}): Promise<Metadata> {
  const { slug, episode } = await params;
  const number = parseEpisode(episode);

  let anime = null;
  if (number) {
    try {
      anime = await resolveAnimeRoute(slug);
    } catch (error) {
      console.error('[Episode metadata] anime resolution failed:', error);
    }
  }

  if (!anime || !number) {
    return {
      title: 'Серия не найдена',
      robots: { index: false, follow: false },
    };
  }

  const identity = getAnimeSeoIdentity(anime);
  const canonical = `${SITE_URL}${animeHref(anime)}/episode/${number}`;
  const copyrightRestriction = await getPlaybackRestriction({
    animeId: anime.id,
    season: anime.providerSeason ?? null,
    episode: number,
  });

  if (copyrightRestriction) {
    const restrictedDescription =
      `${identity.pageHeading} — ${number} серия. Просмотр на AnimeBox недоступен.`;

    return {
      title: `${identity.pageHeading} — ${number} серия недоступна`,
      description: restrictedDescription,
      alternates: { canonical },
      robots: {
        index: false,
        follow: true,
        noarchive: true,
        googleBot: {
          index: false,
          follow: true,
          noarchive: true,
          'max-video-preview': 0,
        },
      },
    };
  }

  const index = await isEpisodeIndexable(anime.id, number).catch((error) => {
    console.warn('[Episode metadata] availability lookup failed:', error);
    return false;
  });
  const title = buildEpisodeSeoTitle(anime, number);
  const description = buildEpisodeSeoDescription(anime, number, index);
  const socialTitle = `${identity.pageHeading} — ${number} серия`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'video.episode',
      url: canonical,
      siteName: 'AnimeBox',
      locale: 'ru_RU',
      title: `${socialTitle} | AnimeBox`,
      description,
      images: anime.bannerImage
        ? [{ url: anime.bannerImage }]
        : anime.coverImage?.extraLarge
          ? [{ url: anime.coverImage.extraLarge }]
          : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${socialTitle} | AnimeBox`,
      description,
      images: anime.bannerImage
        ? [anime.bannerImage]
        : anime.coverImage?.extraLarge
          ? [anime.coverImage.extraLarge]
          : undefined,
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { slug, episode } = await params;
  const number = parseEpisode(episode);

  if (!number) notFound();

  let anime = null;

  try {
    anime = await resolveAnimeRoute(slug);
  } catch (error) {
    console.error('[Episode route] anime resolution failed:', error);
    return <EpisodeRouteRecovery slug={slug} episode={number} />;
  }

  if (!anime) notFound();

  if (slug !== anime.slug) {
    permanentRedirect(`${animeHref(anime)}/episode/${number}`);
  }

  const copyrightRestriction = await getPlaybackRestriction({
    animeId: anime.id,
    season: anime.providerSeason ?? null,
    episode: number,
  });

  if (copyrightRestriction) {
    const identity = getAnimeSeoIdentity(anime);
    return (
      <CopyrightRestrictedEpisode
        slug={anime.slug}
        title={identity.pageHeading}
      />
    );
  }

  const canonical = `${SITE_URL}${animeHref(anime)}/episode/${number}`;
  const indexable = await isEpisodeIndexable(anime.id, number).catch((error) => {
    console.warn('[Episode route] SEO availability lookup failed:', error);
    return false;
  });
  const [indexedEpisode, videoMeta] = indexable
    ? await Promise.all([
        getSeoEpisodeIndexEntry(anime.id, number).catch(() => null),
        getEpisodeTimelineForSeo(anime.id, number).catch(() => null),
      ])
    : [null, null];
  const identity = getAnimeSeoIdentity(anime);

  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'AnimeBox',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: identity.pageHeading,
        item: `${SITE_URL}${animeHref(anime)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${number} серия`,
        item: canonical,
      },
    ],
  };

  const videoStructuredData =
    indexable && indexedEpisode?.firstAvailableAt
      ? buildEpisodeVideoStructuredData(anime, number, canonical, {
          uploadDate: indexedEpisode.firstAvailableAt,
          durationMs: videoMeta?.durationMs ?? null,
          contentUrl: videoMeta?.contentUrl ?? null,
          embedUrl: videoMeta?.playerUrl ?? null,
          thumbnailUrl: indexedEpisode.thumbnailUrl,
        })
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData).replace(/</g, '\\u003c'),
        }}
      />

      {videoStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(videoStructuredData).replace(/</g, '\\u003c'),
          }}
        />
      )}

      <AnimeEpisodePage
        key={anime.slug}
        anime={anime}
        requestedEpisode={number}
      />
    </>
  );
}
