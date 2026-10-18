import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

type Props = {
  title: string;
  id?: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  actions?: ReactNode;
  className?: string;
};

/** Shared editorial heading: independent of legacy global .section-head styles. */
export default function SectionHeader({ title, id, subtitle, href, linkLabel, actions, className = '' }: Props) {
  return (
    <header className={[styles.root, className].filter(Boolean).join(' ')}>
      <div className={styles.copy}>
        <h2 id={id} className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {(actions || (href && linkLabel)) && (
        <div className={styles.actions}>
          {href && linkLabel && <Link href={href} className={styles.link}>{linkLabel} <span aria-hidden="true">→</span></Link>}
          {actions}
        </div>
      )}
    </header>
  );
}
