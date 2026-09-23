'use client';

import Link from 'next/link';
import { ArrowRightIcon, BooksIcon, SparkleIcon } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'framer-motion';

import AnimeBoxIconCore from '@/components/ui/AnimeBoxIconCore';

export default function TrackerGuestEmptyState() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="tracker-guest tracker-guest--luminous">
      <div className="tracker-guest__art">
        <AnimeBoxIconCore size="large" className="tracker-guest__icon-core">
          <motion.span
            className="tracker-guest__books"
            animate={
              reducedMotion
                ? undefined
                : {
                    y: [0, -7, 0],
                    rotate: [0, 1.15, 0, -1.15, 0],
                  }
            }
            transition={{
              duration: 4.2,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          >
            <BooksIcon size={72} weight="light" />
          </motion.span>
        </AnimeBoxIconCore>

        <motion.span
          className="tracker-guest__spark tracker-guest__spark--one"
          aria-hidden="true"
          animate={reducedMotion ? undefined : { opacity: [0.35, 0.9, 0.35], y: [0, -4, 0] }}
          transition={{ duration: 3.4, ease: 'easeInOut', repeat: Infinity }}
        >
          <SparkleIcon size={13} weight="fill" />
        </motion.span>
        <motion.span
          className="tracker-guest__spark tracker-guest__spark--two"
          aria-hidden="true"
          animate={reducedMotion ? undefined : { opacity: [0.25, 0.7, 0.25], y: [0, 3, 0] }}
          transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
        >
          <SparkleIcon size={9} weight="fill" />
        </motion.span>
      </div>

      <span className="tracker-guest__eyebrow">МОЙ ТРЕКЕР</span>
      <h2>Собери свою коллекцию аниме</h2>
      <p>
        Войди, чтобы сохранять тайтлы, отмечать серии и продолжать просмотр
        с того же места на любом устройстве.
      </p>

      <Link href="/login" className="ab-action ab-action--primary tracker-guest__cta">
        Войти и начать
        <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
      </Link>
    </section>
  );
}
