type KodikTranslation = {
  id: number;
  title: string;
  type?: string;
};

export type KodikResult = {
  id: string;
  title?: string;
  title_orig?: string;

  link: string;

  shikimori_id?: string;

  type?: string;

  translation?: KodikTranslation;

  last_season?: number;
  last_episode?: number;
  episodes_count?: number;
};

type KodikResponse = {
  time?: string;
  total?: number;
  results?: KodikResult[];
};

function normalizePlayerUrl(link: string) {
  if (link.startsWith('//')) {
    return `https:${link}`;
  }

  return link;
}

export async function getKodikPlayer(
  shikimoriId: number | null | undefined
): Promise<KodikResult | null> {
  if (!shikimoriId) {
    return null;
  }

  const token = process.env.KODIK_TOKEN;

  if (!token) {
    console.error('[Kodik] KODIK_TOKEN отсутствует');
    return null;
  }

  const params = new URLSearchParams({
    token,
    shikimori_id: String(shikimoriId),
    limit: '20',
  });

  try {
    const response = await fetch(
      `https://kodik-api.com/search?${params.toString()}`,
      {
        next: {
          revalidate: 60 * 60,
        },
      }
    );

    if (!response.ok) {
      console.error(
        '[Kodik] API error:',
        response.status,
        response.statusText
      );

      return null;
    }

    const data =
      (await response.json()) as KodikResponse;

    const result =
      data.results?.find(
        (item) =>
          typeof item.link === 'string' &&
          item.link.length > 0
      ) ?? null;

    if (!result) {
      return null;
    }

    return {
      ...result,
      link: normalizePlayerUrl(result.link),
    };
  } catch (error) {
    console.error('[Kodik] Request failed:', error);

    return null;
  }
}