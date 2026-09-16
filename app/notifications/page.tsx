import type { Metadata } from 'next';

import NotificationSettingsClient from '@/components/NotificationSettingsClient';

export const metadata: Metadata = {
  title: 'Уведомления',
  description: 'Настройки Telegram-уведомлений AnimeBox о новых сериях.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotificationsPage() {
  return (
    <main className="notifications-page">
      <NotificationSettingsClient />
    </main>
  );
}
