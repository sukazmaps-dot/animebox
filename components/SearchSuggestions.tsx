'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { trackProductClientEvent } from '@/lib/product-events-client';
import styles from './SearchSuggestions.module.css';

type Suggestion = {
  id: number;
  title: string;
  href: string;
  posterUrl: string | null;
  genres: string[];
  confidence: number;
};

export default function SearchSuggestions({
  query,
  onChoose,
}: {
  query: string;
  onChoose?: () => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      queueMicrotask(() => {
        setItems([]);
        setOpen(false);
      });
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestRef.current;

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed, limit: '6' });
        const response = await fetch(
          `/api/search/suggestions?${params.toString()}`,
          {
            signal: controller.signal,
            cache: 'default',
            headers: { Accept: 'application/json' },
          },
        );

        if (!response.ok) return;

        const payload = (await response.json()) as { items?: Suggestion[] };
        if (controller.signal.aborted || requestId !== requestRef.current) {
          return;
        }

        const next = Array.isArray(payload.items) ? payload.items : [];
        setItems(next);
        setOpen(next.length > 0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (!open || !items.length) return null;

  return (
    <div className={styles.panel} role="listbox" aria-label="Подсказки поиска">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={styles.item}
          role="option"
          onClick={() => {
            trackProductClientEvent('search_suggestion_click', {
              source: 'global_search',
              path: item.href,
              entityType: 'anime',
              entityId: String(item.id),
              metadata: {
                query: query.trim().slice(0, 180),
                confidence: item.confidence,
              },
            });
            setOpen(false);
            onChoose?.();
          }}
        >
          <span className={styles.poster} aria-hidden="true">
            {item.posterUrl ? (
              // Search suggestions are tiny, short-lived UI and the source
              // host can vary between AniList/Shikimori.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.posterUrl} alt="" loading="lazy" />
            ) : (
              <b>AB</b>
            )}
          </span>

          <span className={styles.copy}>
            <strong>{item.title}</strong>
            <small>
              {item.genres.slice(0, 2).join(' · ') || 'Аниме'}
              {item.confidence >= 75 ? ' · точное совпадение' : ''}
            </small>
          </span>
        </Link>
      ))}

      <Link
        href={`/search?search=${encodeURIComponent(query.trim())}`}
        className={styles.all}
        onClick={() => {
          setOpen(false);
          onChoose?.();
        }}
      >
        Показать все результаты →
      </Link>
    </div>
  );
}
