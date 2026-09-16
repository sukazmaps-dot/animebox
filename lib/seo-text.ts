/** Convert provider/wiki-flavoured text into a clean one-line search snippet. */
export function cleanSeoText(value?: string | null): string {
  if (!value) return '';

  return value
    // Shikimori/Wiki style links: [[Синигами]] -> Синигами.
    .replace(/\[\[([^\[\]]+)\]\]/g, '$1')
    // Short aliases occasionally arrive as [リューク] -> リューク.
    .replace(/\[([^\[\]\n]{1,80})\]/g, '$1')
    // Markdown-ish emphasis and heading noise.
    .replace(/[*_~`#]+/g, '')
    // Any HTML that survived provider cleaning.
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate without cutting a word in half. */
export function truncateSeoText(value: string, maxLength = 158): string {
  const text = value.replace(/\s+/g, ' ').trim();

  if (text.length <= maxLength) return text;

  const slice = text.slice(0, Math.max(1, maxLength - 1));
  const wordBoundary = slice.lastIndexOf(' ');
  const safe = (wordBoundary >= maxLength * 0.7 ? slice.slice(0, wordBoundary) : slice)
    .replace(/[\s,;:—-]+$/g, '')
    .trim();

  return `${safe}…`;
}
