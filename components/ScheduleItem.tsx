'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AnimeImage from '@/components/AnimeImage';
import type { AnimeImage as ImageData } from '@/types/anime';

function EpisodeCountdown({ airingAt }: { airingAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, airingAt * 1000 - now);

  if (remaining <= 0) {
    return <span className="text-xs font-semibold text-emerald-300">Уже вышла</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const value =
    days > 0
      ? `${days}д ${String(hours).padStart(2, '0')}ч`
      : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-violet-200" aria-label={`До выхода серии ${value}`}>
      {value}
    </span>
  );
}

export default function ScheduleItem({ href, title, image, episode, dateLabel, airingAt }: {
  href: string; title: string; image: ImageData | null; episode: number; dateLabel: string; airingAt: number;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 py-3 last:border-b-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-violet-400">
      <div className="h-12 w-8 shrink-0 overflow-hidden rounded-md">
        <AnimeImage image={image} alt={title} sizes="32px" quality={60} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 title={title} className="truncate text-sm font-semibold text-slate-100">{title}</h3>
        <p title={`Эпизод ${episode} · ${dateLabel}`} className="mt-1 truncate text-xs text-slate-400">Эпизод {episode} · {dateLabel}</p>
      </div>
      <div className="flex h-8 w-[76px] shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/15">
        <EpisodeCountdown airingAt={airingAt} />
      </div>
      <span aria-hidden="true" className="w-3 shrink-0 text-slate-500">›</span>
    </Link>
  );
}
