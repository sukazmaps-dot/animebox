'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AnimeImage from '@/components/AnimeImage';
import type { AnimeImage as ImageData } from '@/types/anime';

function EpisodeCountdown({ airingAt, compact }: { airingAt: number; compact: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), compact ? 15000 : 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [compact]);

  if (now === null) return <span aria-label="Обновляем время выхода">—</span>;

  const remaining = Math.max(0, airingAt * 1000 - now);

  if (remaining <= 0) {
    return <span className="schedule-item__released text-xs font-semibold text-emerald-300">Уже вышла</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let value: string;
  if (compact) {
    if (days > 0) value = `${days} д ${hours} ч`;
    else if (hours > 0) value = `${hours} ч ${minutes} мин`;
    else value = minutes > 0 ? `${minutes} мин` : '< 1 мин';
  } else {
    value = days > 0
      ? `${days}д ${String(hours).padStart(2, '0')}ч`
      : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return (
    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-violet-200" aria-label={`До выхода серии ${value}`}>
      {value}
    </span>
  );
}

export default function ScheduleItem({ href, title, image, episode, dateLabel, airingAt, onOpen, compact = false }: {
  href: string;
  title: string;
  image: ImageData | null;
  episode: number;
  dateLabel: string;
  airingAt: number;
  onOpen?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onOpen}
      className="schedule-item flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 py-3 last:border-b-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-violet-400"
    >
      <div className="schedule-item__poster h-12 w-8 shrink-0 overflow-hidden rounded-md">
        <AnimeImage image={image} alt={title} sizes={compact ? "(min-width: 1001px) 48px, 32px" : "32px"} quality={60} sourcePreference="compact" />
      </div>
      <div className="schedule-item__copy min-w-0 flex-1">
        <h3 title={title} className="schedule-item__title truncate text-sm font-semibold text-slate-100">{title}</h3>
        <p title={`Эпизод ${episode} · ${dateLabel}`} className="schedule-item__meta mt-1 truncate text-xs text-slate-400">Эпизод {episode} · {dateLabel}</p>
      </div>
      <div className="schedule-item__countdown flex h-8 w-[76px] shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/15">
        <EpisodeCountdown airingAt={airingAt} compact={compact} />
      </div>
      <span aria-hidden="true" className="schedule-item__chevron w-3 shrink-0 text-slate-500">›</span>
    </Link>
  );
}
