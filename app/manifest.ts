import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AnimeBox — аниме и трекер',
    short_name: 'AnimeBox',
    description:
      'Твой личный аниме-уголок.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080912',
    theme_color: '#080912',
    lang: 'ru',
    icons: [
      {
        src: '/brand/favicon.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  };
}
