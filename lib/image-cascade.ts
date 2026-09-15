import { normalizeImageUrl } from '@/lib/image-service';

export type ImageCascade = {
  posters: string[];
  banner: string | null;
};

function unique(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeImageUrl(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function createImageCascade({
  aniListExtraLarge,
  aniListLarge,
  aniListBanner,
  shikimoriOriginal,
  shikimoriPreview,
}: {
  aniListExtraLarge?: string | null;
  aniListLarge?: string | null;
  aniListBanner?: string | null;
  shikimoriOriginal?: string | null;
  shikimoriPreview?: string | null;
}): ImageCascade {
  const posters = unique([
    aniListExtraLarge,
    aniListLarge,
    shikimoriOriginal,
    shikimoriPreview,
  ]);

  // В banner используем только горизонтальное изображение AniList.
  // Вертикальный постер Shikimori сюда больше не подставляем.
  const banner =
    normalizeImageUrl(aniListBanner) ?? null;

  return {
    posters,
    banner,
  };
}