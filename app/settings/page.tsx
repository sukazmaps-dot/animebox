import type { Metadata } from 'next';

import SettingsClient from '@/components/settings/SettingsClient';

export const metadata: Metadata = {
  title: 'Настройки',
  description: 'Настройки аккаунта, просмотра и уведомлений AnimeBox.',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsClient />;
}
