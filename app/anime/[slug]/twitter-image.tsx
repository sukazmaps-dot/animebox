import { createAnimeSocialImage } from '@/lib/anime-social-image';

export const runtime = 'nodejs';

export const alt = 'AnimeBox — карточка аниме';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TwitterImage({
  params,
}: Props) {
  const { slug } = await params;

  return createAnimeSocialImage(slug);
}
