import Link from 'next/link';

import AnimeCard from '@/components/AnimeCard';
import { getAnimeTitle } from '@/lib/anime-display';
import { animeHref } from '@/lib/anime-url';
import { SITE_URL } from '@/lib/seo-config';
import type { Anime } from '@/types/anime';

type Breadcrumb = {
  label: string;
  path: string;
};

export default function SeoAnimeLanding({
  title,
  description,
  path,
  items,
  breadcrumbs,
}: {
  title: string;
  description: string;
  path: string;
  items: Anime[];
  breadcrumbs: Breadcrumb[];
}) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${path}#page`,
        name: title,
        description,
        url: `${SITE_URL}${path}`,
        inLanguage: 'ru-RU',
        isPartOf: { '@id': `${SITE_URL}#website` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: items.length,
          itemListElement: items.map((anime, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: getAnimeTitle(anime),
            url: `${SITE_URL}${animeHref(anime)}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          item: `${SITE_URL}${item.path}`,
        })),
      },
    ],
  };

  return (
    <div className="search-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />

      <div className="page-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Что посмотреть</h2>
          <Link href="/search" className="section-link">
            Открыть весь каталог →
          </Link>
        </div>

        {items.length ? (
          <div className="anime-grid">
            {items.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Подборка временно недоступна</strong>
            <span>Открой каталог — поиск и фильтры продолжат работать.</span>
          </div>
        )}
      </section>
    </div>
  );
}
