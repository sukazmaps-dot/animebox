'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * App Router can preserve the previous document scroll position when the next
 * page root is still considered visible. Anime detail pages are long enough
 * for that to open a fresh title halfway down the document.
 *
 * Keep this reset route-scoped instead of teaching every AnimeBox card/link
 * how to manage document scrolling.
 */
export default function AnimeRouteScrollReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!pathname.startsWith('/anime/')) return;
    if (window.location.hash) return;

    const reset = () => {
      if (window.scrollX === 0 && window.scrollY === 0) return;

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      });
    };

    // Reset once during the commit and once on the next frame. The second pass
    // wins against late App Router/browser scroll restoration without keeping
    // a listener alive or fighting normal user scrolling afterwards.
    reset();
    const frame = window.requestAnimationFrame(reset);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
