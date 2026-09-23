'use client';

import { motion, useReducedMotion } from 'framer-motion';

const SPARKLES = [
  { left: '12%', top: '16%', delay: 0 },
  { left: '82%', top: '12%', delay: 0.55 },
  { left: '90%', top: '48%', delay: 1.1 },
  { left: '14%', top: '72%', delay: 1.65 },
] as const;

export default function PremiumAiHeroArt() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="premium-ai-hero" aria-label="Ай Хошино — визуальный образ AnimeBox Premium">
      <div className="premium-ai-hero__aura premium-ai-hero__aura--violet" aria-hidden="true" />
      <div className="premium-ai-hero__aura premium-ai-hero__aura--pink" aria-hidden="true" />

      {SPARKLES.map((sparkle, index) => (
        <motion.span
          key={`${sparkle.left}-${sparkle.top}`}
          className="premium-ai-hero__sparkle"
          style={{ left: sparkle.left, top: sparkle.top }}
          aria-hidden="true"
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: [0.28, 0.92, 0.28],
                  scale: [0.82, 1.12, 0.82],
                }
          }
          transition={{
            duration: 2.8,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {index % 2 === 0 ? '✦' : '✧'}
        </motion.span>
      ))}

      <div className="premium-ai-hero__frame">
        <motion.div
          className="premium-ai-hero__image-motion"
          aria-hidden="true"
          animate={
            reduceMotion
              ? undefined
              : {
                  y: [0, -3, 0],
                  scale: [1.015, 1.025, 1.015],
                }
          }
          transition={{
            duration: 8.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
        <img
  src="/premium/ai-hoshino-premium-hero.webp"
  alt="Ай Хошино делает жест сердца руками"
  className="premium-ai-hero__image w-full h-full object-cover object-center"
  draggable={false}
/>
        </motion.div>
        <div className="premium-ai-hero__image-shade" aria-hidden="true" />
        <div className="premium-ai-hero__caption">
          <span>STAR MODE</span>
          <strong>Premium aura</strong>
        </div>
      </div>
    </div>
  );
}
