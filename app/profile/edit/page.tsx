import type { Metadata } from 'next';

import ProfileEditorClient from '@/components/profile/ProfileEditorClient';

export const metadata: Metadata = {
  title: 'Редактор профиля',
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProfileEditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === 'appearance' || params.tab === 'premium' ? params.tab : 'profile';

  return <ProfileEditorClient initialTab={tab} />;
}
