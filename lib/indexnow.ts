import 'server-only';

import { SITE_URL } from '@/lib/seo-config';

export const INDEXNOW_KEY = '3adc5d42355c02686caae2cda63093277a430478e09b0f50';
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_KEY_LOCATION = `${SITE_URL}${INDEXNOW_KEY_PATH}`;

const INDEXNOW_ENDPOINT = 'https://yandex.com/indexnow';
const MAX_URLS_PER_REQUEST = 10_000;
const REQUEST_TIMEOUT_MS = 4_500;

export type IndexNowSubmissionResult = {
  attempted: number;
  accepted: boolean;
  status: number | null;
  truncated: boolean;
};

function normalizeIndexNowUrls(urls: string[]): string[] {
  const site = new URL(SITE_URL);
  const normalized = new Set<string>();

  for (const value of urls) {
    try {
      const url = new URL(value, site);
      if (url.origin !== site.origin) continue;
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;

      url.hash = '';
      normalized.add(url.toString());
    } catch {
      // Ignore malformed candidates. SEO indexing is best-effort and must
      // never turn a content refresh job into a production failure.
    }
  }

  return [...normalized];
}

export async function submitIndexNowUrls(
  urls: string[],
): Promise<IndexNowSubmissionResult> {
  const allUrls = normalizeIndexNowUrls(urls);
  if (!allUrls.length) {
    return {
      attempted: 0,
      accepted: true,
      status: null,
      truncated: false,
    };
  }

  const truncated = allUrls.length > MAX_URLS_PER_REQUEST;
  const urlList = allUrls.slice(0, MAX_URLS_PER_REQUEST);
  const site = new URL(SITE_URL);

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        host: site.host,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const accepted = response.status === 200 || response.status === 202;

    if (!accepted) {
      console.warn('[IndexNow] submission rejected', {
        status: response.status,
        attempted: urlList.length,
      });
    }

    return {
      attempted: urlList.length,
      accepted,
      status: response.status,
      truncated,
    };
  } catch (error) {
    console.warn('[IndexNow] submission failed', error);

    return {
      attempted: urlList.length,
      accepted: false,
      status: null,
      truncated,
    };
  }
}
