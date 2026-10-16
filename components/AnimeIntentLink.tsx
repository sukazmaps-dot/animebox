'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string };
type Connection = { saveData?: boolean; effectiveType?: string };

/** Keep card grids cheap to browse; warm only the route the reader intends to open. */
export default function AnimeIntentLink({
  href, onPointerEnter, onPointerLeave, onPointerCancel, onFocus, onBlur, ...props
}: Props) {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmed = useRef(false);

  function cancel() {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  }

  useEffect(() => {
    warmed.current = false;
    return () => {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
    };
  }, [href]);

  function warm() {
    cancel();
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    if (warmed.current || document.visibilityState === 'hidden' || navigator.onLine === false
      || connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '')) return;
    // Speculative failures must never interfere with normal Link navigation.
    try {
      router.prefetch(href);
      warmed.current = true;
    } catch { /* The click remains the authoritative navigation path. */ }
  }

  return <Link {...props} href={href} prefetch={false}
    onPointerEnter={(event) => {
      onPointerEnter?.(event);
      if (!event.defaultPrevented && event.pointerType === 'mouse') {
        cancel();
        pending.current = setTimeout(warm, 180);
      }
    }}
    onPointerLeave={(event) => { cancel(); onPointerLeave?.(event); }}
    onPointerCancel={(event) => { cancel(); onPointerCancel?.(event); }}
    onFocus={(event) => {
      onFocus?.(event);
      // A touch-induced focus is not keyboard intent.
      if (!event.defaultPrevented && event.currentTarget.matches(':focus-visible')) warm();
    }}
    onBlur={(event) => { cancel(); onBlur?.(event); }}
  />;
}
