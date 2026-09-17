'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin', label: 'Обзор', icon: '◫' },
  { href: '/admin/users', label: 'Пользователи', icon: '◎' },
  { href: '/admin/moderation', label: 'Модерация', icon: '◇' },
  { href: '/admin/monetization', label: 'Монетизация', icon: '✦' },
  { href: '/admin/audit', label: 'Журнал', icon: '≡' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="admin-v1-shell">
      <aside className="admin-v1-sidebar">
        <div className="admin-v1-brand"><span>AB</span><div><strong>AnimeBox</strong><small>Control Center</small></div></div>
        <nav aria-label="Разделы админ-панели">
          {links.map((link) => {
            const active = link.href === '/admin' ? pathname === link.href : pathname.startsWith(link.href);
            return <Link key={link.href} href={link.href} className={active ? 'is-active' : ''}><span aria-hidden="true">{link.icon}</span>{link.label}</Link>;
          })}
        </nav>
        <Link className="admin-v1-back" href="/">← Вернуться на сайт</Link>
      </aside>
      <div className="admin-v1-workspace">{children}</div>
    </div>
  );
}
