'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuthState } from '@/components/AuthStateProvider';
import styles from './AnimePersonalPanel.module.css';

export default function AnimePersonalPanel({ children, animeHref }: { children: ReactNode; animeHref: string }) {
  const { user, loading } = useAuthState();
  if (loading) return <p className={styles.guest} role="status">Проверяем аккаунт…</p>;
  if (!user) return <Link className={styles.guest} href={`/login?next=${encodeURIComponent(animeHref)}`}>Войти для синхронизации библиотеки и оценок</Link>;
  return <section className={styles.panel} aria-label="Мой тайтл">{children}</section>;
}
