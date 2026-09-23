'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function TrackerEmptyArt({ compact = false }: { compact?: boolean }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.svg
      className={compact ? 'tracker-empty-art tracker-empty-art--compact' : 'tracker-empty-art'}
      viewBox="0 0 160 108"
      fill="none"
      aria-hidden="true"
      focusable="false"
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={
        reducedMotion
          ? { opacity: 1, y: 0 }
          : { opacity: 1, y: [0, -5, 0] }
      }
      transition={
        reducedMotion
          ? { duration: 0 }
          : {
              opacity: { duration: .38, ease: 'easeOut' },
              y: { duration: 4.1, ease: 'easeInOut', repeat: Infinity },
            }
      }
    >
      <rect x="14" y="29" width="100" height="65" rx="7" stroke="currentColor" opacity=".27" />
      <rect x="27" y="19" width="100" height="65" rx="7" stroke="currentColor" opacity=".5" />
      <rect x="40" y="10" width="104" height="68" rx="7" fill="#171c2a" stroke="currentColor" strokeWidth="1.7" />
      <rect x="51" y="21" width="32" height="36" rx="3" fill="currentColor" opacity=".12" />
      <path d="M95 28h33M95 38h24M51 66h76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <path d="M51 66h28" stroke="#bca9f4" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M113 52v10m-5-5h10" stroke="#bca9f4" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}
