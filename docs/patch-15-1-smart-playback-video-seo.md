# Patch 15.1 — Smart Playback & Video SEO

## Goal

Connect one canonical episode metadata layer to both AnimeBox playback UX and Google video discovery.

The patch deliberately extends the existing AnimePlayer/watch architecture instead of introducing Video.js/Plyr as a second player stack.

## Data model

`episode_timeline_meta` is server-owned and stores:

- canonical episode duration;
- opening / ending / recap ranges in milliseconds;
- skip metadata source/status;
- verified video content/player URL;
- timestamps for skip lookup and media verification.

RLS is enabled and no browser write policy is created.

## AniSkip

The public player never calls AniSkip directly.

```text
AnimeBox client
  -> /api/episodes/timeline
  -> AnimeBox server
  -> AniSkip v2
  -> validate ranges
  -> episode_timeline_meta
```

The server derives the MAL ID from AnimeBox metadata instead of trusting a browser-provided MAL ID.

Cache policy:

- found skip metadata: 30 days;
- empty result: 12 hours;
- provider error: 30 minutes;
- missing MAL identity: 7 days.

Provider failure is fail-open for playback: the episode simply has no skip button.

## Smart player

The existing player now:

- persists the local crash/resume journal every 5 seconds instead of 10;
- automatically skips the stored opening interval once per episode;
- uses Kodik postMessage seek or the native HTMLVideoElement depending on source;
- keeps `Пропустить опенинг` as a fallback only when the automatic seek is not acknowledged;
- reports a skip signal into the existing watch heartbeat logic so skipped OP time is not treated as normal viewing coverage;
- does not repeatedly auto-skip when the viewer seeks back into the opening after the first attempt;
- starts a 5-second next-episode prompt at the stored ending start;
- falls back to the last 10 seconds when no ending timestamp exists;
- provides an explicit cancel action;
- keeps the existing full end-screen as the final fallback.

Watch Together intentionally does not auto-skip or auto-next from an individual participant.

## Video SEO

AnimeBox now exposes:

`/video-sitemap.xml`

Only episodes with:

- a confirmed indexable episode route;
- a thumbnail;
- a recently verified media/player URL

are emitted.

The sitemap never uses the watch page itself as `video:content_loc`.

Kodik availability can seed a canonical episode-specific `video_player_url` automatically while `seo_episode_index` is synchronized. The normal Kodik player API also refreshes that verification when viewers open an episode.

The sitemap hard-caps at 50,000 video URLs.

## VideoObject

Episode JSON-LD now adds a verified:

- `contentUrl`, when a stable direct media URL exists; otherwise
- `embedUrl`, when a verified player URL exists.

The existing first-available timestamp remains the VideoObject `uploadDate`.

No fake media URL is generated.

## Search discovery

`robots.txt` now advertises `/video-sitemap.xml` in addition to the ordinary root/anime/episode sitemaps.

This improves discovery but does not guarantee ranking or video indexing.

## Production database

The following migrations were applied to production during the patch:

- `20260923112710_episode_timeline_meta_v1.sql`
- `20260923112842_episode_video_seo_view_v1.sql`

## Acceptance checks

1. Open an episode with AniSkip metadata.
2. When playback reaches the OP interval, AnimeBox automatically seeks to the OP end.
3. Seeking back into the OP does not trigger another forced automatic skip in the same episode.
4. If the automatic seek is not acknowledged, the manual `Пропустить опенинг` fallback appears.
5. The skipped interval is reported through watch integrity instead of being credited as normal viewing coverage.
6. At ED start, the 5-second next episode card appears.
7. Cancel prevents automatic navigation.
8. Resume survives refresh with at most ~5 seconds of local loss.
9. `/video-sitemap.xml` is valid XML and only includes entries with real content/player URLs.
10. Episode JSON-LD never points `contentUrl` at the AnimeBox watch page.
