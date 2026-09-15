import { NextRequest, NextResponse } from 'next/server';
import { findAnimeRoute } from '@/lib/anime-registry';
import { collectEpisodePages, episodeOrdinal, exactReleaseTitle, isRecord, pageItems } from '@/lib/provider-episodes';
import { extractHlsVideos } from '@/lib/anilibria';

export const runtime = 'nodejs';
const API_BASES = ['https://aniliberty.top/api/v1', 'https://anilibria.top/api/v1', 'https://api.anilibria.app/api/v1'];

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') || '';
  const episode = Number(request.nextUrl.searchParams.get('episode'));
  if (!slug || !Number.isSafeInteger(episode) || episode < 1) {
    return NextResponse.json({ reason: 'invalid_request' }, { status: 400 });
  }
  const record = findAnimeRoute(slug);
  if (!record) return NextResponse.json({ reason: 'unknown_slug' }, { status: 404 });
  const titleData = JSON.parse(record.titles) as Record<string, string | null>;
  const titles = [...new Set(Object.values(titleData).filter((s): s is string => Boolean(s?.trim())))];
  const requestedSeason = request.nextUrl.searchParams.get('season');
  if (requestedSeason && Number(requestedSeason) !== record.provider_season) {
    return NextResponse.json({ reason: 'stale_season_selection' }, { status: 409 });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)]);
  let uncertain = false;
  let reason = 'not_found';
  for (const base of API_BASES) {
    const fetchJson = async (url: string): Promise<unknown> => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
        next: { revalidate: 120 }, redirect: 'error',
      });
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return response.json();
    };
    try {
      let alias = record.provider_alias;
      if (!alias) {
        const matches = new Map<string, unknown>();
        for (const title of titles) {
          const url = new URL(`${base}/app/search/releases`);
          url.searchParams.set('query', title);
          const candidates = pageItems(await fetchJson(url.href));
          for (const item of candidates) {
            if (!isRecord(item) || !exactReleaseTitle(item, titles)) continue;
            const key = item.alias;
            if (typeof key === 'string' && key) matches.set(key, item);
          }
          if (matches.size) break;
        }
        if (matches.size > 1) {
          uncertain = true; reason = 'ambiguous_release'; continue;
        }
        alias = matches.keys().next().value || null;
      }
      if (!alias) continue;
      const endpoint = `${base}/anime/releases/${encodeURIComponent(alias)}`;
      const response = await fetchJson(endpoint);
      const root = isRecord(response) && isRecord(response.data) ? response.data : response;
      if (!isRecord(root) || (!record.provider_alias && !exactReleaseTitle(root, titles))) {
        uncertain = true; reason = 'release_mismatch'; continue;
      }
      if (!Array.isArray(root.episodes) && !isRecord(root.episodes)) {
        uncertain = true; reason = 'unknown_episode_list'; continue;
      }
      const all = await collectEpisodePages(root.episodes, endpoint, fetchJson);
      const episodes = all.map(episodeOrdinal).filter((n): n is number => n !== null);
      const selected = all.find(item => episodeOrdinal(item) === episode);
      const hls = selected ? extractHlsVideos(selected, new URL(base).origin) : [];
      return NextResponse.json({
        slug, title: titleData.romaji || titleData.english || titleData.russian,
        season: record.provider_season, releaseAlias: alias,
        episodes, hls, externalPlayer: null,
        reason: hls.length ? '' : 'episode_unavailable',
      }, { headers: { 'Cache-Control': 'private, max-age=60' } });
    } catch {
      uncertain = true;
      reason = 'upstream_error';
      if (signal.aborted) break;
    }
  }
  return NextResponse.json({ hls: [], episodes: [], externalPlayer: null, reason: uncertain ? reason : 'not_found' }, {
    status: uncertain ? 503 : 200, headers: { 'Cache-Control': 'no-store' },
  });
}
