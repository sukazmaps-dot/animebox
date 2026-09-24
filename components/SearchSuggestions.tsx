'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { trackProductClientEvent } from '@/lib/product-events-client';
import styles from './SearchSuggestions.module.css';

type Suggestion = {
  id: number;
  title: string;
  href: string;
  posterUrl: string | null;
  genres: string[];
  confidence: number;
  matchKind?: string | null;
  matchedText?: string | null;
};

function highlightTitle(title: string, query: string) {
  const needle = query.trim();
  if (!needle) return title;

  const lowerTitle = title.toLocaleLowerCase('ru-RU');
  const lowerNeedle = needle.toLocaleLowerCase('ru-RU');
  const index = lowerTitle.indexOf(lowerNeedle);
  if (index < 0) return title;

  return (
    <>
      {title.slice(0, index)}
      <mark>{title.slice(index, index + needle.length)}</mark>
      {title.slice(index + needle.length)}
    </>
  );
}

export default function SearchSuggestions({
  query,
  onChoose,
}: {
  query: string;
  onChoose?: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      queueMicrotask(() => {
        setItems([]);
        setOpen(false);
        setActiveIndex(-1);
      });
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestRef.current;

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery, limit: '6' });
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
        if (controller.signal.aborted || requestId !== requestRef.current) return;

        const next = Array.isArray(payload.items) ? payload.items : [];
        setItems(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }, 170);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  useEffect(() => {
    if (!open || !items.length) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => {
          if (event.key === 'ArrowDown') {
            return current >= items.length - 1 ? 0 : current + 1;
          }
          return current <= 0 ? items.length - 1 : current - 1;
        });
        return;
      }

      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        const item = items[activeIndex];
        if (!item) return;

        trackProductClientEvent('search_suggestion_keyboard', {
          source: 'global_search',
          path: item.href,
          entityType: 'anime',
          entityId: String(item.id),
          metadata: {
            query: trimmedQuery.slice(0, 180),
            position: activeIndex,
            confidence: item.confidence,
          },
        });
        setOpen(false);
        setActiveIndex(-1);
        onChoose?.();
        router.push(item.href);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items, onChoose, open, router, trimmedQuery]);

  if (!open || !items.length) return null;

  return (
    <div className={styles.panel} role="listbox" aria-label="Подсказки поиска">
      {items.map((item, index) => (
        <Link
          key={item.id}
          href={item.href}
          className={[
            styles.item,
            index === activeIndex ? styles.itemActive : '',
          ].filter(Boolean).join(' ')}
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => {
            trackProductClientEvent('search_suggestion_click', {
              source: 'global_search',
              path: item.href,
              entityType: 'anime',
              entityId: String(item.id),
              metadata: {
                query: trimmedQuery.slice(0, 180),
                confidence: item.confidence,
                match_kind: item.matchKind ?? null,
              },
            });
            setOpen(false);
            setActiveIndex(-1);
            onChoose?.();
          }}
        >
          <span className={styles.poster} aria-hidden="true">
            {item.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.posterUrl} alt="" loading="lazy" />
            ) : (
              <b>AB</b>
            )}
          </span>

          <span className={styles.copy}>
            <strong>{highlightTitle(item.title, trimmedQuery)}</strong>
            <small>
              {item.genres.slice(0, 2).join(' · ') || 'Аниме'}
              {item.confidence >= 90 ? ' · точное совпадение' : ''}
            </small>
          </span>
        </Link>
      ))}

      <Link
        href={`/search?search=${encodeURIComponent(trimmedQuery)}`}
        className={styles.all}
        onClick={() => {
          setOpen(false);
          setActiveIndex(-1);
          onChoose?.();
        }}
      >
        Показать все результаты →
      </Link>
    </div>
  );
}
