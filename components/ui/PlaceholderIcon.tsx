'use client';

import { motion, useReducedMotion } from 'framer-motion';

type PlaceholderIconProps = {
  variant: 'discussion' | 'saved' | 'search';
  className?: string;
};

export default function PlaceholderIcon({ variant, className = '' }: PlaceholderIconProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={`grid size-24 shrink-0 place-items-center rounded-xl border border-purple-400/15 bg-slate-950/40 text-purple-400/50 ${className}`}
    >
      <motion.svg
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        animate={reducedMotion ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
      >
        {variant === 'discussion' ? (
          <>
            <path d="M12 15h30a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H27L16 51v-8a6 6 0 0 1-4-6V21a6 6 0 0 1 6-6Z" />
            <path d="M23 27h14M23 33h10" />
          </>
        ) : variant === 'saved' ? (
          <path d="M19 11h26a3 3 0 0 1 3 3v39L32 42 16 53V14a3 3 0 0 1 3-3Z" />
        ) : (
          <>
            <circle cx="28" cy="28" r="16" />
            <path d="m40 40 12 12M22 28h12" />
          </>
        )}
      </motion.svg>
    </div>
  );
}
