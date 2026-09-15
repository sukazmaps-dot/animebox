'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import Hls from 'hls.js';

export type TranslationOption = {
  title: string;
  url: string;
  type?: 'hls' | 'iframe' | 'video';
};

export type PlayerSource = {
  name: string;
  translations: TranslationOption[];
  type?: 'hls' | 'iframe' | 'video';
};

interface AnimePlayerProps {
  title: string;
  episodeNumber: number;
  totalEpisodes?: number | null;
  totalEpisodesKnown?: boolean;
  poster?: string;
  sources?: PlayerSource[];
  src?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

function toProxyHls(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/hls?url=${encodeURIComponent(url)}`;
}

export default function AnimePlayer({
  title,
  episodeNumber,
  totalEpisodes,
  totalEpisodesKnown = true,
  poster,
  sources = [],
  src,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
}: AnimePlayerProps) {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeTranslationIndex, setActiveTranslationIndex] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentSource = sources[activeSourceIndex];
  const currentTranslation = currentSource?.translations[activeTranslationIndex];
  const rawLink = currentTranslation?.url || src || '';
  const normalizedLink = rawLink.startsWith('//') ? `https:${rawLink}` : rawLink;
  const mediaType = currentTranslation?.type || currentSource?.type ||
    (/\.m3u8(?:$|\?)/i.test(normalizedLink) ? 'hls' : 'iframe');
  const isIframe = mediaType === 'iframe';
  const isHls = mediaType === 'hls';
  const videoLink = isHls ? toProxyHls(normalizedLink) : normalizedLink;

  useEffect(() => {
    setPlayerError(null);
  }, [videoLink, activeSourceIndex, activeTranslationIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHls || !videoLink) return;

    let hls: Hls | null = null;

    const onVideoError = () => {
      setPlayerError('Не удалось воспроизвести HLS-поток.');
    };

    video.addEventListener('error', onVideoError);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoLink;
      video.load();
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
      });

      hls.loadSource(videoLink);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          setPlayerError(data.details || 'Ошибка HLS-потока.');
          hls?.destroy();
        }
      });
    } else {
      setPlayerError('Этот браузер не поддерживает HLS.');
    }

    return () => {
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
    };
  }, [videoLink, isHls]);

  return (
    <div className="player">
      <div className="player__header">
        <div className="player__heading">
          <span className="player__title">{title}</span>
          <span className="player__episode">
            Серия {episodeNumber}
            {totalEpisodes ? (totalEpisodesKnown ? ` из ${totalEpisodes}` : ` · вышло ${totalEpisodes}`) : ''}
          </span>
        </div>

        {sources.length > 0 && (
          <div className="flex items-center gap-1.5 bg-gray-900/80 p-1 rounded-xl border border-gray-800">
            {sources.map((source, index) => (
              <button
                key={`${source.name}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSourceIndex(index);
                  setActiveTranslationIndex(0);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  activeSourceIndex === index
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {source.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {currentSource && currentSource.translations.length > 1 && (
        <div className="flex flex-wrap gap-1.5 py-2 px-1">
          <span className="text-xs text-gray-400 self-center mr-1">Качество:</span>
          {currentSource.translations.map((tr, index) => (
            <button
              key={`${tr.title}-${index}`}
              type="button"
              onClick={() => setActiveTranslationIndex(index)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                activeTranslationIndex === index
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {tr.title}
            </button>
          ))}
        </div>
      )}

   <div className="player__frame relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl">
        {!videoLink ? (
       <div className="flex h-full items-center justify-center text-white/60">
       Видео для этой серии пока недоступно.
      </div>
  ) : isIframe ? (
    <iframe
      key={videoLink}
      src={videoLink}
      width="100%"
      height="100%"
      className="h-full w-full"
      allowFullScreen
      title="Anime player"
    />
  ) : (
          <video
            ref={videoRef}
            key={videoLink}
            className="player__video absolute inset-0 w-full h-full object-contain bg-black"
            controls
            autoPlay
            playsInline
            muted={false}
            poster={poster || undefined}
            preload="auto"
            src={!isHls ? videoLink : undefined}
          >
            Ваш браузер не поддерживает воспроизведение видео.
          </video>
        )}

        {playerError && !isIframe && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center pointer-events-none">
            <span className="text-sm text-red-300">{playerError}</span>
          </div>
        )}
      </div>

      <div className="player__controls">
        <button
          type="button"
          className="btn btn--ghost player__nav-btn"
          onClick={onPrev}
          disabled={!hasPrev}
        >
          <Icon name="chevron" className="player__nav-icon player__nav-icon--prev" />
          Пред. серия
        </button>

        <span className="player__hint">
          {currentSource?.name || 'Источник не выбран'}
        </span>

        <button
          type="button"
          className="btn btn--primary player__nav-btn"
          onClick={onNext}
          disabled={!hasNext}
        >
          След. серия
          <Icon name="chevron" className="player__nav-icon" />
        </button>
      </div>
    </div>
  );
}
