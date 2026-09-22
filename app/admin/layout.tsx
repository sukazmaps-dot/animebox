import '../premium.css';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import AdminShell from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/admin-server';

import '../boosty-support.css';
import '../monetization-reliability-v10.css';
import './admin.css';
import '../sponsor-v2.css';
import '../monetization-v3.css';

export const metadata: Metadata = {
  title: 'Управление AnimeBox',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    // Do not reveal the existence or structure of the control center
    // to unauthenticated / non-admin users.
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}
