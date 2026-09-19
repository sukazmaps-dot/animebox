import type { Metadata } from 'next';

import CommunityAdminClient from '@/components/admin/CommunityAdminClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Community Admin',
  robots: { index: false, follow: false },
};

export default function CommunityAdminPage() {
  return <CommunityAdminClient />;
}
