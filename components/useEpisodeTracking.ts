'use client';
import { useEffect, useState, type RefObject } from 'react';
import { communityRequest } from '@/lib/community-client';
import { mergePlayedRanges, coveredSeconds } from '@/lib/played-coverage';
export function useEpisodeTracking(videoRef: RefObject<HTMLVideoElement | null>, animeId: number | undefined, episode: number, source: string, iframe: boolean) {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !animeId || iframe) return;
    let ranges: [number, number][] = [];
    let previous: { media: number; wall: number } | null = null;
    let saved = false;
    let pending = false;
    let retryAt = 0;
    let active = true;
    const reset = () => { previous = null; };
    const sample = () => {
      const now = performance.now();
      const media = video.currentTime;
      if (video.seeking || video.paused || video.readyState < 2) { reset(); return; }
      if (previous) {
        const delta = media - previous.media;
        const wall = (now - previous.wall) / 1000;
        if (delta > 0 && wall < 3 && delta <= wall * Math.max(1, video.playbackRate) + 0.5) {
          ranges = mergePlayedRanges(ranges, previous.media, media);
        }
      }
      previous = { media, wall: now };
      if (!saved && !pending && now >= retryAt && Number.isFinite(video.duration) && video.duration > 0 && coveredSeconds(ranges) >= video.duration * 0.9) {
        pending = true;
        communityRequest('episodes', { animeId, episode, completed: true, source: 'player' }).then(() => {
          saved = true;
          if (active) { setMessage('Серия засчитана: просмотрено не менее 90%.'); window.dispatchEvent(new Event('episode-completed')); }
        }).catch((error: Error) => { retryAt = performance.now() + 60000; if (active) setMessage(error.message); })
          .finally(() => { pending = false; });
      }
    };
    video.addEventListener('timeupdate', sample);
    video.addEventListener('seeking', reset);
    video.addEventListener('pause', reset);
    return () => { active = false; video.removeEventListener('timeupdate', sample); video.removeEventListener('seeking', reset); video.removeEventListener('pause', reset); };
  }, [videoRef, animeId, episode, source, iframe]);
  return message;
}
