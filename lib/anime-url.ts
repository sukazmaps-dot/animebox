/** URL formatting is pure; uniqueness is enforced by the server database. */
export function slugify(title: string): string {
  const letters: Record<string, string> = Object.fromEntries(
    Array.from('абвгдеёжзийклмнопрстуфхцчшщъыьэюя').map((c, i) => [c,
      ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','y','','e','yu','ya'][i]])
  );
  return title.toLowerCase().replace(/[а-яё]/g, c => letters[c])
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120).replace(/-$/, '') || 'anime';
}
export function animeHref(anime: { id: number | string; slug?: string | null }): string {
  // Old localStorage entries remain usable through the numeric redirect.
  return `/anime/${encodeURIComponent(anime.slug || String(anime.id))}`;
}
