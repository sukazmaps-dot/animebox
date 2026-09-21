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

const parseEpisode = (value: string): number | null => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}): Promise<Metadata> {
  const { slug, episode } = await params;
  const number = parseEpisode(episode);
  const anime = number ? await resolveAnimeRoute(slug) : null;

  if (!anime || !number) {
    return {
      title: 'Серия не найдена',
      robots: { index: false, follow: false },
    };
  }

  const identity = getAnimeSeoIdentity(anime);
  const canonical = `${SITE_URL}${animeHref(anime)}/episode/${number}`;
  const index = await isEpisodeIndexable(anime.id, number);
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

  const anime = await resolveAnimeRoute(slug);
  if (!anime) notFound();

  if (slug !== anime.slug) {
    permanentRedirect(`${animeHref(anime)}/episode/${number}`);
  }

  const canonical = `${SITE_URL}${animeHref(anime)}/episode/${number}`;
  const indexable = await isEpisodeIndexable(anime.id, number);
  const indexedEpisode = indexable
    ? await getSeoEpisodeIndexEntry(anime.id, number).catch(() => null)
    : null;
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
