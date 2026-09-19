import type { Metadata } from 'next';
import '../boosty-support.css';
import '../monetization-reliability-v10.css';
import AdminShell from '@/components/admin/AdminShell';
import './admin.css';

import '../sponsor-v2.css';
import '../monetization-v3.css';
export const metadata: Metadata = {
  title: 'Управление AnimeBox',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
