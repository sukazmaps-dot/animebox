export function getImageUrl(image: any): string {
  if (!image) return '/placeholder.jpg';

  // Если image — объект (AniList / Shikimori)
  const url = typeof image === 'string' 
    ? image 
    : image.extraLarge || image.large || image.original || image.medium || '';

  if (!url) return '/placeholder.jpg';

  // Если путь относительный (Shikimori) — добавляем домен
  if (url.startsWith('/')) {
    return `https://shikimori.one${url}`;
  }

  return url;
}